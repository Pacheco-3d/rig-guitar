#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <vector>

namespace rig {
constexpr float pi=3.14159265358979323846f;
struct Settings {
 std::array<float,24> v{6.5f,5,7,6,5.5f,7.5f,0,1,0,.6f,0,1,4,6,1,3.5f,5,1,4,3,1,5,2.5f,-70};
};
class Convolver {
 static constexpr size_t B=128,N=256;
 using Spectrum=std::array<std::complex<float>,N>;
 std::vector<Spectrum> kernels,history;
 Spectrum scratch{},sum{};
 std::array<float,B> incoming{},out{},overlap{};
 size_t position=0,head=0;
 static void fft(Spectrum& a,bool inverse){
  for(size_t i=1,j=0;i<N;i++){size_t bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)std::swap(a[i],a[j]);}
  for(size_t len=2;len<=N;len*=2){float angle=(inverse?2:-2)*pi/static_cast<float>(len);std::complex<float> step(std::cos(angle),std::sin(angle));for(size_t i=0;i<N;i+=len){std::complex<float>w(1,0);for(size_t j=0;j<len/2;j++){auto u=a[i+j],v=a[i+j+len/2]*w;a[i+j]=u+v;a[i+j+len/2]=u-v;w*=step;}}}
  if(inverse)for(auto& x:a)x/=N;
 }
 public:
 void prepare(const std::vector<float>& impulse){
  if(impulse.size()>8192)throw std::runtime_error("IR exceeds 8192 samples");
  kernels.assign((impulse.size()+B-1)/B,{});history.assign(kernels.size(),{});position=head=0;incoming.fill(0);out.fill(0);overlap.fill(0);
  for(size_t p=0;p<kernels.size();p++){for(size_t i=0;i<B&&p*B+i<impulse.size();i++)kernels[p][i]=impulse[p*B+i];fft(kernels[p],false);}
 }
 bool active()const{return !kernels.empty();}
 float process(float input){
  if(kernels.empty())return input;
  float result=out[position];incoming[position++]=input;
  if(position==B){scratch.fill({});for(size_t i=0;i<B;i++)scratch[i]=incoming[i];fft(scratch,false);history[head]=scratch;sum.fill({});
   for(size_t p=0;p<kernels.size();p++){const auto& h=history[(head+kernels.size()-p)%kernels.size()];for(size_t i=0;i<N;i++)sum[i]+=kernels[p][i]*h[i];}
   fft(sum,true);for(size_t i=0;i<B;i++){out[i]=sum[i].real()+overlap[i];overlap[i]=sum[i+B].real();}head=(head+1)%kernels.size();position=0;
  }return result;
 }
};
struct Biquad {
 float b0=1,b1=0,b2=0,a1=0,a2=0,z1=0,z2=0;
 float process(float x){float y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b2*x-a2*y;return y;}
 void reset(){z1=z2=0;}
 void configure(int type,float hz,float db,float sr){
  float A=std::pow(10.f,db/40),w=2*pi*hz/sr,c=std::cos(w),s=std::sin(w),alpha=s/(2*.7071f),root=2*std::sqrt(A)*alpha,a0;
  if(type==0){b0=A*((A+1)-(A-1)*c+root);b1=2*A*((A-1)-(A+1)*c);b2=A*((A+1)-(A-1)*c-root);a0=(A+1)+(A-1)*c+root;a1=-2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-root;}
  else if(type==1){b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;}
  else{b0=A*((A+1)+(A-1)*c+root);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-root);a0=(A+1)-(A-1)*c+root;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-root;}
  b0/=a0;b1/=a0;b2/=a0;a1/=a0;a2/=a0;
 }
};
class Dsp {
 float sampleRate=48000,env=0,gate=0,toneState=0,cabState=0,dcX=0,dcY=0;
 Biquad bass,mid,treble,presence;
 std::vector<float> delay;
 size_t delayHead=0;
 std::array<std::array<float,4096>,4> room{};
 std::array<size_t,4> roomHead{};
 std::array<size_t,4> roomLength{1493,1601,1867,2053};
 Settings settings;
 float previousEq[4]{-100,-100,-100,-100};
 float toneAlpha=.3f,cabAlpha=.5f,delaySamples=16000,roomFeedback=.75f,gateThreshold=.00032f;
 public:
 Convolver cabinet;
 explicit Dsp(float sr=48000):sampleRate(sr),delay(static_cast<size_t>(sr*2),0){for(auto& n:roomLength)n=std::min<size_t>(4095,n*sr/48000);setSettings(settings);}
 void setSettings(Settings s){
  for(float& f:s.v)if(!std::isfinite(f))f=0;
  settings=s;auto&v=settings.v;
  for(int i=0;i<6;i++)v[i]=std::clamp(v[i],0.f,10.f);
  v[9]=std::clamp(v[9],0.f,1.f);v[6]=std::clamp(v[6],0.f,2.f);v[10]=std::clamp(v[10],0.f,2.f);
  for(int i:{12,13,15,16,18,19,21,22})v[i]=std::clamp(v[i],0.f,10.f);
  v[23]=std::clamp(v[23],-90.f,-20.f);
  if(previousEq[0]!=v[1]){bass.configure(0,160,(v[1]-5)*2,sampleRate);previousEq[0]=v[1];}
  if(previousEq[1]!=v[2]){mid.configure(1,900,(v[2]-5)*2,sampleRate);previousEq[1]=v[2];}
  if(previousEq[2]!=v[3]){treble.configure(2,3200,(v[3]-5)*2,sampleRate);previousEq[2]=v[3];}
  if(previousEq[3]!=v[4]){presence.configure(1,4500,(v[4]-5)*1.5f,sampleRate);previousEq[3]=v[4];}
  toneAlpha=1-std::exp(-2*pi*(900+v[16]*650)/sampleRate);
  const float cutoffs[]{6500,4200,8000};cabAlpha=1-std::exp(-2*pi*cutoffs[std::clamp(static_cast<int>(v[10]),0,2)]/sampleRate);
  gateThreshold=std::pow(10.f,v[23]/20);
  delaySamples=std::clamp((.06f+v[18]*.065f)*sampleRate,1.f,static_cast<float>(delay.size()-2));roomFeedback=.55f+v[21]*.037f;
 }
 float process(float input){
  auto&v=settings.v;float x=std::isfinite(input)?std::clamp(input,-4.f,4.f):0;
  // Global bypass preserves the original signal, with master volume and peak protection.
  const bool bypass=v[8]>.5f;const float dry=x;if(bypass)x=0;
  float dc=x-dcX+.995f*dcY;dcX=x;dcY=dc;x=dc;
  env=std::max(std::abs(x),env*.9995f);float target=env>gateThreshold?1.f:0.f;gate+=(target>gate?.1f:.0004f)*(target-gate);x*=gate;
  if(v[11]>.5f){float limit=.12f-v[12]*.008f;float gain=env>limit?std::pow(limit/(env+1e-8f),v[13]/15):1; x*=gain*(1+v[12]*.05f);}
  if(v[14]>.5f){float drive=1+v[15]*1.7f;x=std::tanh(x*drive)/std::sqrt(drive);toneState+=toneAlpha*(x-toneState);x=toneState;}
  if(v[7]>.5f){float factors[]{1.4f,.45f,2.5f};float factor=factors[std::clamp(static_cast<int>(v[6]),0,2)];float drive=1+v[0]*factor;x=std::tanh(x*drive)/std::sqrt(drive);x=bass.process(x);x=mid.process(x);x=treble.process(x);x=presence.process(x);cabState+=cabAlpha*(x-cabState);x=cabinet.process(cabState)*v[5]/10;}
  float delayed=0;
  if(v[17]>.5f){float read=delayHead+delay.size()-delaySamples;size_t i=static_cast<size_t>(read)%delay.size(),j=(i+1)%delay.size();float fraction=read-std::floor(read);delayed=delay[i]*(1-fraction)+delay[j]*fraction;delay[delayHead]=x+delayed*std::min(.7f,v[19]*.07f);x=x*.85f+delayed*.3f;}
  else delay[delayHead]=0;
  delayHead=(delayHead+1)%delay.size();
  {float wet=0;float roomInput=v[20]>.5f?x:0;for(size_t i=0;i<4;i++){float y=room[i][roomHead[i]];room[i][roomHead[i]]=roomInput+y*roomFeedback;wet+=y;roomHead[i]=(roomHead[i]+1)%roomLength[i];}float mix=v[20]>.5f?v[22]*.04f:0;x=x*(1-mix*.5f)+wet*.25f*mix;}
  if(bypass){return std::clamp(dry*v[9],-.98f,.98f);}
  x*=v[9];if(!std::isfinite(x))return 0;return std::clamp(std::tanh(x),-.98f,.98f);
 }
};
struct WaveData{uint32_t sampleRate;std::vector<float> samples;};
inline WaveData readWave(const std::vector<uint8_t>& bytes){
 auto u16=[&](size_t p)->uint16_t{if(p+2>bytes.size())throw std::runtime_error("Truncated WAV");return bytes[p]|(bytes[p+1]<<8);};
 auto u32=[&](size_t p)->uint32_t{if(p+4>bytes.size())throw std::runtime_error("Truncated WAV");return uint32_t(bytes[p])|(uint32_t(bytes[p+1])<<8)|(uint32_t(bytes[p+2])<<16)|(uint32_t(bytes[p+3])<<24);};
 if(bytes.size()<44||std::memcmp(bytes.data(),"RIFF",4)||std::memcmp(bytes.data()+8,"WAVE",4))throw std::runtime_error("Use um arquivo WAV PCM ou float válido");
 uint16_t format=0,channels=0,bits=0,align=0;uint32_t rate=0;size_t dataAt=0,dataSize=0;
 for(size_t p=12;p+8<=bytes.size();){size_t size=u32(p+4);if(size>bytes.size()-p-8)throw std::runtime_error("Chunk WAV inválido");if(!std::memcmp(bytes.data()+p,"fmt ",4)){if(size<16)throw std::runtime_error("Formato WAV inválido");format=u16(p+8);channels=u16(p+10);rate=u32(p+12);align=u16(p+20);bits=u16(p+22);}if(!std::memcmp(bytes.data()+p,"data",4)){dataAt=p+8;dataSize=size;}p+=8+size+(size&1);}
 if(!dataAt||!dataSize||channels<1||channels>2||rate<8000||rate>192000||!((format==1&&(bits==16||bits==24||bits==32))||(format==3&&bits==32))||align!=channels*bits/8||dataSize%align)throw std::runtime_error("IR: WAV mono/estéreo PCM 16/24/32 ou float32");
 if(dataSize/align>rate*2)throw std::runtime_error("IR de gabinete deve ter no máximo 2 segundos");
 WaveData result{rate,{}};result.samples.reserve(dataSize/align);
 for(size_t p=dataAt;p<dataAt+dataSize;p+=align){float value=0;for(int c=0;c<channels;c++){size_t at=p+c*(bits/8);float x=0;if(format==3){uint32_t word=u32(at);std::memcpy(&x,&word,4);}else if(bits==16)x=static_cast<int16_t>(u16(at))/32768.f;else if(bits==24){int32_t n=bytes[at]|(bytes[at+1]<<8)|(bytes[at+2]<<16);if(n&0x800000)n|=~0xffffff;x=n/8388608.f;}else x=static_cast<int32_t>(u32(at))/2147483648.f;if(!std::isfinite(x))throw std::runtime_error("IR contém valores inválidos");value+=x/channels;}result.samples.push_back(value);}
 return result;
}
inline std::vector<float> prepareIr(const WaveData& wav,float outputRate=48000){
 size_t count=std::min<size_t>(8192,static_cast<size_t>(wav.samples.size()*outputRate/wav.sampleRate));std::vector<float> ir(count);
 for(size_t i=0;i<count;i++){float p=i*wav.sampleRate/outputRate;size_t a=std::min<size_t>(wav.samples.size()-1,p),b=std::min(a+1,wav.samples.size()-1);ir[i]=wav.samples[a]+(wav.samples[b]-wav.samples[a])*(p-a);}
 double energy=0;for(float f:ir)energy+=std::abs(f);if(energy<1e-9f)throw std::runtime_error("IR silencioso");if(energy>2.f)for(float&f:ir)f*=2.f/energy;return ir;
}
} // namespace rig
