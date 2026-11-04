#include "../android/app/src/main/cpp/Dsp.h"
#include <cassert>
#include <iostream>
#include <fstream>
int main(){
 // Partitioned convolution must match a direct FIR across partition boundaries.
 std::vector<float> ir(400);for(size_t i=0;i<ir.size();i++)ir[i]=std::sin(i*.17f)*std::exp(-static_cast<float>(i)*.02f)*.02f;
 rig::Convolver convolution;convolution.prepare(ir);std::vector<float>x(1600),y(1600);for(size_t i=0;i<800;i++)x[i]=std::sin(i*.13f)*.3f;
 for(size_t i=0;i<x.size();i++)y[i]=convolution.process(x[i]);
 for(size_t i=128;i<y.size();i++){float expected=0;for(size_t j=0;j<ir.size()&&j<=i-128;j++)expected+=ir[j]*x[i-128-j];assert(std::abs(expected-y[i])<.00002f);}
 rig::Dsp dsp;rig::Settings s;s.v[8]=1;s.v[9]=.5f;dsp.setSettings(s);assert(std::abs(dsp.process(.4f)-.2f)<1e-6f);
 s.v[8]=0;dsp.setSettings(s);float energy=0;for(int i=0;i<96000;i++){float out=dsp.process(std::sin(2*rig::pi*220*i/48000)*.2f);assert(std::isfinite(out)&&std::abs(out)<=.98f);energy+=out*out;}assert(energy>1);
 // Malformed WAVs and silent IRs must fail before entering the audio callback.
 bool failed=false;try{rig::readWave({0,1,2});}catch(...){failed=true;}assert(failed);
 failed=false;try{rig::prepareIr({48000,std::vector<float>(100,0)});}catch(...){failed=true;}assert(failed);
 for(const char* name:{"studio-reference","warm-vintage","bright-open"}){std::ifstream f(std::string("library/irs/")+name+".wav",std::ios::binary);std::vector<uint8_t>bytes((std::istreambuf_iterator<char>(f)),{});auto wav=rig::readWave(bytes);assert(wav.sampleRate==48000&&wav.samples.size()==1024);auto processed=rig::prepareIr(wav);assert(processed.size()==1024);dsp.cabinet.prepare(processed);for(int i=0;i<4800;i++)assert(std::isfinite(dsp.process(i==0?.5f:0)));}
 s.v[6]=1e38f;s.v[10]=1e38f;s.v[0]=NAN;dsp.setSettings(s);for(int i=0;i<4096;i++)assert(std::isfinite(dsp.process(i%5==0?INFINITY:.1f)));
 std::cout<<"PASS: partitioned convolution vs direct FIR, bypass, finite bounded DSP output, WAV rejection, 3 original cabinet IRs\n";
}
