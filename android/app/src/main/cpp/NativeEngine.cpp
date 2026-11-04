#include "Dsp.h"
#include <aaudio/AAudio.h>
#include <jni.h>
#include <atomic>
#include <memory>
#include <string>

namespace {
class Engine {
 AAudioStream* input=nullptr;
 AAudioStream* output=nullptr;
 std::unique_ptr<rig::Dsp> dsp;
 std::vector<float> ir;
 std::array<std::atomic<float>,24> params;
 std::array<float,512> capture{};
 public:
 std::atomic<bool> running{false};
 std::atomic<int> error{0};
 std::atomic<float> level{0};
 Engine(){rig::Settings s;for(size_t i=0;i<24;i++)params[i].store(s.v[i]);}
 ~Engine(){stop();}
 static aaudio_data_callback_result_t callback(AAudioStream*,void* user,void* data,int32_t frames){
  auto* e=static_cast<Engine*>(user);auto* out=static_cast<float*>(data);rig::Settings settings;for(size_t i=0;i<24;i++)settings.v[i]=e->params[i].load(std::memory_order_relaxed);e->dsp->setSettings(settings);float peak=0;
  for(int32_t offset=0;offset<frames;){int32_t n=std::min<int32_t>(512,frames-offset);aaudio_result_t read=AAudioStream_read(e->input,e->capture.data(),n,0);if(read<0){e->error.store(read);read=0;}for(int32_t i=0;i<n;i++){float value=e->dsp->process(i<read?e->capture[i]:0);peak=std::max(peak,std::abs(value));out[(offset+i)*2]=value;out[(offset+i)*2+1]=value;}offset+=n;}
  e->level.store(peak,std::memory_order_relaxed);return AAUDIO_CALLBACK_RESULT_CONTINUE;
 }
 static void onError(AAudioStream*,void* user,aaudio_result_t result){auto*e=static_cast<Engine*>(user);e->error.store(result);}
 std::string openStream(bool isInput,int device,aaudio_sharing_mode_t sharing){
  AAudioStreamBuilder* b=nullptr;auto result=AAudio_createStreamBuilder(&b);if(result!=AAUDIO_OK)return AAudio_convertResultToText(result);
  AAudioStreamBuilder_setDirection(b,isInput?AAUDIO_DIRECTION_INPUT:AAUDIO_DIRECTION_OUTPUT);AAudioStreamBuilder_setSampleRate(b,48000);AAudioStreamBuilder_setFormat(b,AAUDIO_FORMAT_PCM_FLOAT);AAudioStreamBuilder_setChannelCount(b,isInput?1:2);AAudioStreamBuilder_setPerformanceMode(b,AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);AAudioStreamBuilder_setSharingMode(b,sharing);if(device>0)AAudioStreamBuilder_setDeviceId(b,device);
  AAudioStreamBuilder_setErrorCallback(b,onError,this);
  if(isInput)AAudioStreamBuilder_setInputPreset(b,AAUDIO_INPUT_PRESET_UNPROCESSED);
  else{AAudioStreamBuilder_setUsage(b,AAUDIO_USAGE_MEDIA);AAudioStreamBuilder_setContentType(b,AAUDIO_CONTENT_TYPE_MUSIC);AAudioStreamBuilder_setDataCallback(b,callback,this);}
  result=AAudioStreamBuilder_openStream(b,isInput?&input:&output);AAudioStreamBuilder_delete(b);
  if(result!=AAUDIO_OK)return AAudio_convertResultToText(result);
  return {};
 }
 std::string start(int inputDevice,int outputDevice){
  stop();error.store(0);dsp=std::make_unique<rig::Dsp>(48000);dsp->cabinet.prepare(ir);
  std::string failure=openStream(true,inputDevice,AAUDIO_SHARING_MODE_EXCLUSIVE);if(!failure.empty())failure=openStream(true,inputDevice,AAUDIO_SHARING_MODE_SHARED);if(!failure.empty()){stop();return "Entrada: "+failure;}
  failure=openStream(false,outputDevice,AAUDIO_SHARING_MODE_EXCLUSIVE);if(!failure.empty())failure=openStream(false,outputDevice,AAUDIO_SHARING_MODE_SHARED);if(!failure.empty()){stop();return "Saída: "+failure;}
  if(AAudioStream_getSampleRate(input)!=48000||AAudioStream_getSampleRate(output)!=48000||AAudioStream_getChannelCount(input)!=1||AAudioStream_getChannelCount(output)!=2){stop();return "Dispositivo não aceitou 48 kHz mono-in / stereo-out";}
  int burst=AAudioStream_getFramesPerBurst(output);AAudioStream_setBufferSizeInFrames(output,burst*2);
  auto result=AAudioStream_requestStart(input);if(result==AAUDIO_OK)result=AAudioStream_requestStart(output);if(result!=AAUDIO_OK){std::string message=AAudio_convertResultToText(result);stop();return message;}
  running.store(true);return {};
 }
 void stop(){running.store(false);if(output){AAudioStream_requestStop(output);AAudioStream_close(output);output=nullptr;}if(input){AAudioStream_requestStop(input);AAudioStream_close(input);input=nullptr;}level.store(0);error.store(0);}
 void configure(const std::vector<float>& values){for(size_t i=0;i<values.size()&&i<24;i++)if(std::isfinite(values[i]))params[i].store(values[i],std::memory_order_relaxed);}
 std::string loadIr(const std::vector<uint8_t>& bytes){try{auto prepared=bytes.empty()?std::vector<float>{}:rig::prepareIr(rig::readWave(bytes));stop();ir=std::move(prepared);return {};}catch(const std::exception& e){return e.what();}}
 int xruns(){return output?AAudioStream_getXRunCount(output):0;}
 int bufferFrames(){return output?AAudioStream_getBufferSizeInFrames(output):0;}
};
Engine engine;
jstring asString(JNIEnv*env,const std::string&s){return env->NewStringUTF(s.c_str());}
}
extern "C" JNIEXPORT jstring JNICALL Java_com_rigguitar_studio_AudioEngine_start(JNIEnv*env,jclass,jint in,jint out){return asString(env,engine.start(in,out));}
extern "C" JNIEXPORT void JNICALL Java_com_rigguitar_studio_AudioEngine_stop(JNIEnv*,jclass){engine.stop();}
extern "C" JNIEXPORT void JNICALL Java_com_rigguitar_studio_AudioEngine_configure(JNIEnv*env,jclass,jfloatArray data){jsize size=env->GetArrayLength(data);std::vector<float>v(size);env->GetFloatArrayRegion(data,0,size,v.data());engine.configure(v);}
extern "C" JNIEXPORT jstring JNICALL Java_com_rigguitar_studio_AudioEngine_loadIr(JNIEnv*env,jclass,jbyteArray data){jsize size=env->GetArrayLength(data);std::vector<uint8_t>v(size);env->GetByteArrayRegion(data,0,size,reinterpret_cast<jbyte*>(v.data()));return asString(env,engine.loadIr(v));}
extern "C" JNIEXPORT jstring JNICALL Java_com_rigguitar_studio_AudioEngine_status(JNIEnv*env,jclass){std::string s="{\"running\":"+std::string(engine.running.load()?"true":"false")+",\"level\":"+std::to_string(engine.level.load())+",\"error\":"+std::to_string(engine.error.load())+",\"xruns\":"+std::to_string(engine.xruns())+",\"bufferFrames\":"+std::to_string(engine.bufferFrames())+",\"sampleRate\":48000}";return asString(env,s);}
