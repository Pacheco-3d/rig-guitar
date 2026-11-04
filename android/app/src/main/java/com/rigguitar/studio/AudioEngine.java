package com.rigguitar.studio;

final class AudioEngine {
  static {
    System.loadLibrary("rig_audio");
  }

  static native String start(int inputDevice, int outputDevice);

  static native void stop();

  static native void configure(float[] settings);

  static native String loadIr(byte[] wav);

  static native String status();
}
