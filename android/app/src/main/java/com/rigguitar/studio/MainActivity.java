package com.rigguitar.studio;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  private static final int PERMISSION_AUDIO = 10,
      PICK_IR = 11,
      PICK_TREE = 12,
      EXPORT_ZIP = 13,
      PICK_WEB = 14,
      IMPORT_PRESETS = 15;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final ExecutorService audioWorker = Executors.newSingleThreadExecutor();
  private final Handler handler = new Handler(Looper.getMainLooper());
  private WebView web;
  private SharedPreferences preferences;
  private AudioManager audioManager;
  private AudioFocusRequest focusRequest;
  private File library;
  private volatile boolean destroyed = false, resumed = false;
  private int inputDevice = 0, outputDevice = 0;
  private ValueCallback<Uri[]> webFileCallback;
  private final AudioDeviceCallback deviceCallback =
      new AudioDeviceCallback() {
        @Override
        public void onAudioDevicesAdded(AudioDeviceInfo[] devices) {
          emitDevices();
        }

        @Override
        public void onAudioDevicesRemoved(AudioDeviceInfo[] devices) {
          stopAudio("Dispositivo desconectado. Confira a interface USB antes de reconectar.");
          emitDevices();
        }
      };
  private final Runnable poll =
      new Runnable() {
        public void run() {
          if (destroyed) return;
          audioWorker.execute(
              () -> {
                try {
                  JSONObject s = new JSONObject(AudioEngine.status());
                  if (s.optInt("error") < 0) {
                    AudioEngine.stop();
                    handler.post(
                        () -> {
                          getWindow()
                              .clearFlags(
                                  android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                          audioManager.abandonAudioFocusRequest(focusRequest);
                        });
                    event("error", "A rota de áudio foi interrompida. Reconecte a interface.");
                    s = new JSONObject(AudioEngine.status());
                  }
                  event("engine", s);
                } catch (Exception ignored) {
                }
              });
          handler.postDelayed(this, 500);
        }
      };

  // JavaScript is required by the packaged UI; all WebView requests are restricted to bundled
  // assets.
  @SuppressLint("SetJavaScriptEnabled")
  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(0xff343230);
    getWindow().setNavigationBarColor(0xff343230);
    preferences = getSharedPreferences("rig", MODE_PRIVATE);
    library = new File(getFilesDir(), "library");
    audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
    focusRequest =
        new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build())
            .setOnAudioFocusChangeListener(
                change -> {
                  if (change < 0) stopAudio("Áudio pausado por outro aplicativo.");
                })
            .build();
    web = new WebView(this);
    web.setBackgroundColor(0xff343230);
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(true);
    web.addJavascriptInterface(new Bridge(), "RigAndroid");
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return true;
          }

          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String path = uri.getPath();
            if (!"https".equals(uri.getScheme())
                || !"appassets.androidplatform.net".equals(uri.getHost())
                || path == null) return denied();
            String asset;
            switch (path) {
              case "/":
              case "/index.html":
                asset = "ui/index.html";
                break;
              case "/style.css":
                asset = "ui/style.css";
                break;
              case "/app.js":
                asset = "ui/app.js";
                break;
              case "/library.js":
                asset = "ui/library.js";
                break;
              default:
                return denied();
            }
            try {
              String mime =
                  asset.endsWith(".css")
                      ? "text/css"
                      : asset.endsWith(".js") ? "text/javascript" : "text/html";
              return new WebResourceResponse(mime, "UTF-8", getAssets().open(asset));
            } catch (IOException e) {
              return denied();
            }
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            worker.execute(
                () -> {
                  try {
                    installLibrary();
                    String selected = preferences.getString("selectedIr", "studio-reference.wav");
                    loadIr(selected, false);
                    event("library", libraryJson());
                    emitDevices();
                  } catch (Exception e) {
                    event("error", "Biblioteca: " + e.getMessage());
                  }
                });
          }
        });
    web.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onShowFileChooser(
              WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (webFileCallback != null) webFileCallback.onReceiveValue(null);
            webFileCallback = callback;
            Intent intent =
                new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .setType("audio/*")
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
              startActivityForResult(intent, PICK_WEB);
              return true;
            } catch (Exception e) {
              webFileCallback = null;
              callback.onReceiveValue(null);
              return false;
            }
          }
        });
    FrameLayout container = new FrameLayout(this);
    container.setBackgroundColor(0xff343230);
    container.addView(web, new FrameLayout.LayoutParams(-1, -1));
    container.setOnApplyWindowInsetsListener(
        (view, insets) -> {
          view.setPadding(
              insets.getSystemWindowInsetLeft(),
              insets.getSystemWindowInsetTop(),
              insets.getSystemWindowInsetRight(),
              insets.getSystemWindowInsetBottom());
          return insets.consumeSystemWindowInsets();
        });
    setContentView(container);
    audioManager.registerAudioDeviceCallback(deviceCallback, handler);
    web.loadUrl("https://appassets.androidplatform.net/index.html");
    handler.post(poll);
  }

  private WebResourceResponse denied() {
    return new WebResourceResponse(
        "text/plain", "UTF-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
  }

  private void event(String type, Object payload) {
    try {
      JSONObject message = new JSONObject().put("type", type).put("payload", payload);
      String json = message.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
      handler.post(
          () -> {
            if (!destroyed)
              web.evaluateJavascript(
                  "window.onRigNativeEvent&&window.onRigNativeEvent(" + json + ")", null);
          });
    } catch (Exception ignored) {
    }
  }

  private void emitDevices() {
    if (audioManager == null) return;
    try {
      JSONArray in = new JSONArray(), out = new JSONArray();
      for (AudioDeviceInfo d : audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS))
        in.put(
            new JSONObject()
                .put("id", d.getId())
                .put("name", d.getProductName().toString())
                .put("type", d.getType()));
      for (AudioDeviceInfo d : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS))
        out.put(
            new JSONObject()
                .put("id", d.getId())
                .put("name", d.getProductName().toString())
                .put("type", d.getType()));
      event("devices", new JSONObject().put("inputs", in).put("outputs", out));
    } catch (Exception ignored) {
    }
  }

  private void startAudio() {
    if (!resumed) return;
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, PERMISSION_AUDIO);
      return;
    }
    if (audioManager.requestAudioFocus(focusRequest) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
      event("error", "Outro aplicativo está usando o áudio.");
      return;
    }
    audioWorker.execute(
        () -> {
          if (!resumed) return;
          String error = AudioEngine.start(inputDevice, outputDevice);
          if (!error.isEmpty()) {
            event("error", error);
            handler.post(() -> audioManager.abandonAudioFocusRequest(focusRequest));
          } else {
            handler.post(
                () ->
                    getWindow()
                        .addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            event(
                "message",
                "Guitarra conectada. Use fones ou uma interface USB para evitar retorno acústico.");
          }
        });
  }

  private void stopAudio(String reason) {
    handler.post(
        () -> getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
    audioWorker.execute(
        () -> {
          AudioEngine.stop();
          if (reason != null) event("message", reason);
        });
    if (audioManager != null && focusRequest != null)
      audioManager.abandonAudioFocusRequest(focusRequest);
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
    super.onRequestPermissionsResult(code, perms, results);
    if (code == PERMISSION_AUDIO) {
      if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startAudio();
      else event("error", "Permita o acesso à entrada de áudio nas configurações do Android.");
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    resumed = true;
  }

  @Override
  protected void onPause() {
    resumed = false;
    stopAudio(null);
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    destroyed = true;
    handler.removeCallbacksAndMessages(null);
    audioManager.unregisterAudioDeviceCallback(deviceCallback);
    if (webFileCallback != null) webFileCallback.onReceiveValue(null);
    audioWorker.execute(AudioEngine::stop);
    audioWorker.shutdown();
    worker.shutdown();
    web.removeJavascriptInterface("RigAndroid");
    web.destroy();
    super.onDestroy();
  }

  private final class Bridge {
    @JavascriptInterface
    public void startEngine(int input, int output) {
      handler.post(
          () -> {
            inputDevice = input;
            outputDevice = output;
            startAudio();
          });
    }

    @JavascriptInterface
    public void stopEngine() {
      handler.post(() -> stopAudio(null));
    }

    @JavascriptInterface
    public void refreshDevices() {
      emitDevices();
    }

    @JavascriptInterface
    public void setSettings(String json) {
      audioWorker.execute(
          () -> {
            try {
              JSONArray a = new JSONArray(json);
              if (a.length() != 24) return;
              float[] v = new float[24];
              for (int i = 0; i < 24; i++) {
                v[i] = (float) a.getDouble(i);
                if (!Float.isFinite(v[i])) return;
              }
              AudioEngine.configure(v);
            } catch (Exception ignored) {
            }
          });
    }

    @JavascriptInterface
    public void pickIr() {
      handler.post(() -> openDocument(PICK_IR, "*/*"));
    }

    @JavascriptInterface
    public void selectIr(String id) {
      worker.execute(
          () -> {
            try {
              loadIr(id, true);
              event("library", libraryJson());
            } catch (Exception e) {
              event("error", e.getMessage());
              try {
                event("library", libraryJson());
              } catch (Exception ignored) {
              }
            }
          });
    }

    @JavascriptInterface
    public void chooseDriveFolder() {
      handler.post(
          () -> {
            Intent i =
                new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                    .addFlags(
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            try {
              startActivityForResult(i, PICK_TREE);
            } catch (Exception e) {
              event(
                  "error",
                  "O provedor não permite escolher pastas. Use Exportar biblioteca e selecione o"
                      + " Google Drive.");
            }
          });
    }

    @JavascriptInterface
    public void exportLibrary() {
      handler.post(
          () -> {
            Intent i =
                new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .setType("application/zip")
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .putExtra(Intent.EXTRA_TITLE, "rig-guitar-library.zip");
            startActivityForResult(i, EXPORT_ZIP);
          });
    }

    @JavascriptInterface
    public void importPresets() {
      handler.post(() -> openDocument(IMPORT_PRESETS, "application/json"));
    }

    @JavascriptInterface
    public void savePresets(String json) {
      worker.execute(
          () -> {
            try {
              JSONArray a = new JSONArray(json);
              if (a.length() > 500 || json.length() > 2_000_000)
                throw new IOException("Biblioteca de presets muito grande");
              File f = new File(library, "presets/user.json");
              writeFile(f, json.getBytes(StandardCharsets.UTF_8));
              preferences.edit().putString("userPresets", json).apply();
              syncFolder();
            } catch (Exception e) {
              event("error", "Presets locais salvos; backup: " + e.getMessage());
            }
          });
    }

    @JavascriptInterface
    public String getSavedPresets() {
      return preferences.getString("userPresets", "[]");
    }
  }

  private void openDocument(int code, String mime) {
    Intent i =
        new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .setType(mime)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    try {
      startActivityForResult(i, code);
    } catch (Exception e) {
      event("error", "Nenhum seletor de arquivos disponível.");
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == PICK_WEB) {
      if (webFileCallback != null) {
        webFileCallback.onReceiveValue(
            result == RESULT_OK && data != null && data.getData() != null
                ? new Uri[] {data.getData()}
                : null);
        webFileCallback = null;
      }
      return;
    }
    if (result != RESULT_OK || data == null || data.getData() == null) return;
    Uri uri = data.getData();
    worker.execute(
        () -> {
          try {
            if (request == PICK_IR) {
              byte[] bytes = readBounded(getContentResolver().openInputStream(uri), 4_000_000);
              if (bytes.length < 44) throw new IOException("Arquivo WAV vazio ou inválido");
              String id = "import-" + digest(bytes) + ".wav";
              String error = audioWorker.submit(() -> AudioEngine.loadIr(bytes)).get();
              if (!error.isEmpty()) throw new IOException(error);
              writeFile(new File(library, "irs/" + id), bytes);
              preferences
                  .edit()
                  .putString("selectedIr", id)
                  .putString("irLabel:" + id, documentName(uri))
                  .apply();
              event("library", libraryJson());
              syncFolder();
              event("message", "IR importado. Reconecte o áudio para tocar com o novo gabinete.");
            } else if (request == PICK_TREE) {
              if ((data.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == 0)
                throw new IOException("A pasta não permite escrita. Use Exportar biblioteca.");
              getContentResolver()
                  .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
              getContentResolver()
                  .takePersistableUriPermission(uri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
              preferences.edit().putString("driveTree", uri.toString()).apply();
              syncFolder();
              event("library", libraryJson());
            } else if (request == EXPORT_ZIP) {
              try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("Destino indisponível");
                writeZip(out);
              }
              event(
                  "message",
                  "Biblioteca exportada. O Google Drive sincroniza conforme o provedor do"
                      + " Android.");
            } else if (request == IMPORT_PRESETS) {
              String json =
                  new String(
                      readBounded(getContentResolver().openInputStream(uri), 2_000_000),
                      StandardCharsets.UTF_8);
              event("importPresets", new JSONArray(json));
            }
          } catch (Exception e) {
            event("error", e.getMessage() == null ? "Operação indisponível" : e.getMessage());
          }
        });
  }

  private void installLibrary() throws IOException {
    for (String sub : new String[] {"irs", "presets"}) {
      String[] names = getAssets().list("library/" + sub);
      if (names != null)
        for (String name : names) {
          File dest = new File(library, sub + "/" + name);
          if (!dest.exists())
            try (InputStream in = getAssets().open("library/" + sub + "/" + name)) {
              writeFile(dest, readBounded(in, 4_000_000));
            }
        }
    }
  }

  private JSONObject libraryJson() throws Exception {
    JSONArray irs = new JSONArray();
    File dir = new File(library, "irs");
    File[] files = dir.listFiles();
    if (files != null)
      for (File f : files)
        if (f.getName().endsWith(".wav"))
          irs.put(
              new JSONObject()
                  .put("id", f.getName())
                  .put(
                      "name",
                      preferences.getString(
                          "irLabel:" + f.getName(), f.getName().replace(".wav", "")))
                  .put("bytes", f.length()));
    return new JSONObject()
        .put("irs", irs)
        .put("selectedIr", preferences.getString("selectedIr", "studio-reference.wav"))
        .put("folderConnected", !preferences.getString("driveTree", "").isEmpty())
        .put("cloudAccountVerified", false)
        .put("lastSync", preferences.getLong("lastSync", 0));
  }

  private void loadIr(String id, boolean restart) throws Exception {
    if (!id.matches("[a-zA-Z0-9._-]+\\.wav")) throw new IOException("IR inválido");
    File file = new File(library, "irs/" + id);
    if (!file.isFile()) throw new IOException("IR não encontrado");
    byte[] bytes = readBounded(new FileInputStream(file), 4_000_000);
    String failure =
        audioWorker
            .submit(
                () -> {
                  boolean active = new JSONObject(AudioEngine.status()).optBoolean("running");
                  String error = AudioEngine.loadIr(bytes);
                  if (!error.isEmpty()) return error;
                  if (active && restart && resumed)
                    return AudioEngine.start(inputDevice, outputDevice);
                  return "";
                })
            .get();
    if (!failure.isEmpty()) throw new IOException(failure);
    preferences.edit().putString("selectedIr", id).apply();
  }

  private Uri findOrCreate(Uri tree, String parent, String name, String mime) throws Exception {
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parent);
    try (android.database.Cursor c =
        getContentResolver()
            .query(
                children,
                new String[] {
                  DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                  DocumentsContract.Document.COLUMN_DISPLAY_NAME
                },
                null,
                null,
                null)) {
      if (c != null)
        while (c.moveToNext())
          if (name.equals(c.getString(1)))
            return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
    }
    Uri result =
        DocumentsContract.createDocument(
            getContentResolver(),
            DocumentsContract.buildDocumentUriUsingTree(tree, parent),
            mime,
            name);
    if (result == null)
      throw new IOException("A pasta não permite criar arquivos. Use Exportar biblioteca.");
    return result;
  }

  private void syncFolder() throws Exception {
    String saved = preferences.getString("driveTree", "");
    if (saved.isEmpty()) return;
    Uri tree = Uri.parse(saved);
    String root = DocumentsContract.getTreeDocumentId(tree);
    try {
      Uri applicationFolder =
          findOrCreate(tree, root, "rig-guitar-library", DocumentsContract.Document.MIME_TYPE_DIR);
      root = DocumentsContract.getDocumentId(applicationFolder);
      for (String sub : new String[] {"irs", "presets"}) {
        Uri folder = findOrCreate(tree, root, sub, DocumentsContract.Document.MIME_TYPE_DIR);
        String parent = DocumentsContract.getDocumentId(folder);
        File[] files = new File(library, sub).listFiles();
        if (files == null) continue;
        for (File file : files) {
          if (!file.isFile() || file.getName().endsWith(".tmp")) continue;
          Uri target =
              findOrCreate(
                  tree,
                  parent,
                  file.getName(),
                  sub.equals("irs") ? "audio/wav" : "application/json");
          try (OutputStream out = getContentResolver().openOutputStream(target, "wt");
              InputStream in = new FileInputStream(file)) {
            if (out == null) throw new IOException("Destino indisponível");
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
          }
        }
      }
      preferences.edit().putLong("lastSync", System.currentTimeMillis()).apply();
      event("driveSync", "Biblioteca gravada em rig-guitar-library/irs e presets.");
    } catch (Exception error) {
      event("driveSync", "Falha no backup. Seus arquivos locais estão preservados.");
      throw error;
    }
  }

  private void writeZip(OutputStream output) throws IOException {
    try (ZipOutputStream zip = new ZipOutputStream(output)) {
      for (String sub : new String[] {"irs", "presets"}) {
        File[] files = new File(library, sub).listFiles();
        if (files == null) continue;
        for (File f : files)
          if (f.isFile()) {
            zip.putNextEntry(new ZipEntry(sub + "/" + f.getName()));
            try (InputStream in = new FileInputStream(f)) {
              byte[] buf = new byte[8192];
              int n;
              while ((n = in.read(buf)) != -1) zip.write(buf, 0, n);
            }
            zip.closeEntry();
          }
      }
      zip.putNextEntry(new ZipEntry("README.txt"));
      zip.write(
          "RIG Guitar library. IRs sintéticos originais; presets inspirados, não oficiais. Restaure WAVs pelo importador IR e user.json pelo importador de presets.\n"
              .getBytes(StandardCharsets.UTF_8));
      zip.closeEntry();
    }
  }

  private static byte[] readBounded(InputStream source, int max) throws IOException {
    if (source == null) throw new IOException("Arquivo indisponível");
    try (InputStream in = source;
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) != -1) {
        if (out.size() + n > max) throw new IOException("Arquivo excede o limite permitido");
        out.write(buf, 0, n);
      }
      return out.toByteArray();
    }
  }

  private static void writeFile(File file, byte[] bytes) throws IOException {
    File parent = file.getParentFile();
    if (parent != null && !parent.isDirectory() && !parent.mkdirs())
      throw new IOException("Não foi possível criar biblioteca");
    File temporary = new File(file.getPath() + ".tmp");
    try (FileOutputStream out = new FileOutputStream(temporary)) {
      out.write(bytes);
      out.getFD().sync();
    }
    if (!temporary.renameTo(file)) throw new IOException("Não foi possível salvar arquivo");
  }

  private String documentName(Uri uri) {
    try (android.database.Cursor c =
        getContentResolver()
            .query(
                uri,
                new String[] {android.provider.OpenableColumns.DISPLAY_NAME},
                null,
                null,
                null)) {
      if (c != null && c.moveToFirst()) return c.getString(0);
    } catch (Exception ignored) {
    }
    return "IR importado";
  }

  private static String digest(byte[] b) throws Exception {
    byte[] hash = MessageDigest.getInstance("SHA-256").digest(b);
    StringBuilder s = new StringBuilder();
    for (int i = 0; i < 10; i++) s.append(String.format("%02x", hash[i]));
    return s.toString();
  }
}
