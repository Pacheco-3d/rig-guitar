# RIG Guitar — Android pedalboard

App Android leve com interface HTML inspirada na organização clássica de racks de guitarra: bancos e presets no Browser, módulos verticais, knobs, gabinete e Live View. O APK não depende de um servidor: inclui a interface e usa um motor C++/AAudio para a entrada de guitarra.

## Android

- Android 9/API 28 ou superior; ARM64, ARMv7 e x86_64.
- Entrada mono e saída estéreo a 48 kHz, solicitando o modo de baixa latência do Android.
- Selecione uma interface USB OTG e saída para fones com fio. Conecte a guitarra à entrada apropriada da interface; o telefone sozinho não fornece uma entrada Hi-Z.
- Toque em **Conectar guitarra** e conceda permissão de áudio. O áudio ao vivo para ao sair do app, perder o foco de áudio ou desconectar uma rota.
- Bluetooth adiciona atraso. O tamanho de buffer exibido não é a latência total da cadeia. A latência real depende do aparelho e da interface e ainda precisa ser medida em hardware físico.

## Timbres e efeitos

24 presets de fábrica: seis timbres originais e 18 pontos de partida inspirados em artistas, incluindo Gilmour, The Edge, Slash, Metallica, Hendrix, AC/DC, SRV, Van Halen, Nirvana, Prince, Knopfler, Black Sabbath e Queen. Não são presets oficiais, gravações dos artistas, nem reproduções exatas de amplificadores comerciais. Confira `library/presets/factory.json`.

Motor nativo: gate, compressor, overdrive, três caracteres de amplificador, EQ, gabinete por convolução particionada, delay e reverberação. Os modelos são DSP básico original e não substituem modeladores comerciais. A prévia web usa Web Audio; não se afirma equivalência sonora exata entre os dois motores.

**Comparar** alterna entre o preset original e os ajustes atuais. A aba **Componentes** permite ativar/desativar módulos. **Live View** mostra footswitches para troca de timbres e efeitos.

## Biblioteca de IRs

Inclui três FIRs sintéticos originais de gabinete, em WAV mono/48 kHz, com licença CC0. Não são capturas medidas de gabinetes comerciais. O gerador reproduzível está em `scripts/generate-library.py`.

No Android, **Importar IR WAV** copia o arquivo para a biblioteca interna do app. Aceita WAV PCM16/24/32 e float32, mono ou estéreo (convertido em mono), entre 8 e 192 kHz e até dois segundos/4 MB. O motor usa no máximo 8192 amostras depois da conversão para 48 kHz, apropriado para gabinetes. IRs de reverberação longos são truncados. Selecionar IR enquanto o áudio toca reinicia brevemente a rota; importar um novo IR deixa o áudio parado para reconexão.

Na prévia web, IRs importados ficam somente na sessão atual. Os IRs de fábrica estão embutidos no HTML independente.

## Google Drive e backups

O caminho `J:\Meu Drive\rig guitar` é do computador Windows e não é acessível pelo app Android ou por este checkout. O e-mail `edu3dpb@gmail.com` identifica a conta pretendida, mas não autoriza acesso automático.

O app usa o **seletor de documentos do Android**, sem incorporar senhas ou tokens:

1. Instale/conecte o Google Drive no Android à conta desejada.
2. Em **Vincular pasta**, selecione a pasta `rig guitar` se o provedor oferecer seleção de diretórios. O app guarda a permissão concedida e grava subpastas `rig-guitar-library/irs/` e `rig-guitar-library/presets/` quando você importa um IR ou salva presets.
3. Alguns provedores/versões do Google Drive não oferecem pastas no seletor. Nesse caso, use **Exportar biblioteca** e escolha `rig guitar` no Google Drive. Isso salva um ZIP com IRs, presets de fábrica e seus presets.
4. Para restaurar o ZIP, extraia seus arquivos. Importe os WAVs por **Importar IR** e `presets/user.json` por **Importar presets**.

A escolha da conta é feita no provedor do Android. O app não verifica o e-mail, não executa login OAuth próprio e não mantém sincronização automática em segundo plano. O provedor decide quando enviar os arquivos; sem conexão eles podem ficar pendentes. Nenhuma pasta foi criada remotamente nesta sessão porque o conector do Drive não foi autorizado. A exportação/importação continua disponível pelo dispositivo.

Os dados locais permanecem no app mesmo se o backup falhar. Não desinstale antes de exportar seus presets e IRs. Backups do Android estão desabilitados; use a biblioteca explícita para preservar os dados.

## Compilar

Requer JDK 17 ou 21, Android SDK 35/build-tools 35.0.0, NDK 27.2.12479018 e CMake 3.22.1. Abra `android/` no Android Studio ou use:

```sh
./android/gradlew -p android assembleDebug lintDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. O Gradle Wrapper tem versão e SHA-256 fixados. O workflow `.github/workflows/android.yml` compila e publica um **artefato de teste** no GitHub Actions; ele não publica na Play Store. APK debug usa assinatura de desenvolvimento; uma chave de lançamento permanente deve ser configurada separadamente para distribuição estável.

## Prévia HTML e testes

```sh
npm ci
npm run dev             # servidor local, porta 3000; PORT permite alterar
npm run build           # dist/rig-studio.html, HTML autossuficiente
npm run check
npm run test:dsp        # requer g++ com C++17
npx playwright install chromium
npm run test:ui         # deixe o servidor aberto em outro terminal
npm run test:bridge
npm run test:standalone # valida o HTML embutido sem recursos remotos
```

Para usar um Chromium existente, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `RIG_TEST_URL` muda o endereço usado nos testes. As dependências npm são apenas para desenvolvimento; não fazem parte do APK.

Verificações realizadas: compilação Android nas três ABIs, lint, convolução comparada a FIR direto, leitura/rejeição de WAVs, saída finita do DSP, navegação/persistência, reprodução real da demo e de arquivo importado, IRs, comparação, Live View e layout em cinco larguras. O teste da ponte Android usa um mock e não substitui um teste em aparelho. Veja [validação no Android](docs/ANDROID-VALIDATION.md).
