# Validação em aparelho Android

As verificações em host/Chromium e a compilação não comprovam o funcionamento do driver USB de um telefone. Esta rodada de hardware está pendente e deve anteceder qualquer afirmação de baixa latência ou liberação estável.

## Instalação e entrada

- Instalar o APK debug e verificar inicialização, orientação e áreas do sistema.
- Negar permissão de áudio: exibir erro recuperável sem iniciar captura.
- Conectar interface USB class-compliant via OTG; selecionar entrada e saída corretas.
- Começar com master baixo, fones com fio e monitoramento direto da interface desligado, para não misturar sinal seco e processado.
- Confirmar captação no canal mono correto, sem eco acústico, cliques ou variação de pitch.
- Desconectar USB durante uso: captura deve parar e permitir reconexão.
- Trocar para outro app, bloquear a tela ou receber interrupção de áudio: a captura deve parar.
- Medir atraso de ida e volta com loopback físico; registrar aparelho, versão Android, interface, buffer, taxa e xruns após 15 minutos. Buffer não equivale à latência total.

## DSP e biblioteca

- Ouvir todos os presets com single coil e humbucker; ajustar níveis de saída para evitar diferenças excessivas.
- Testar bypass, comparação, mudanças de modelo e cada efeito; confirmar ausência de picos/NaNs e de travamentos.
- Importar IRs PCM16, PCM24, PCM32 e float32; mono/estéreo e 44,1/48/96 kHz.
- Rejeitar WAV truncado, vazio, silencioso e excessivamente longo, preservando a biblioteca existente.
- Salvar timbre com IR importado, fechar/reabrir o app e verificar todos os parâmetros.

## Google Drive

- Usar a conta edu3dpb@gmail.com e a pasta rig guitar pelo seletor do Android.
- Se houver suporte a diretórios, escolher a pasta, salvar preset e importar IR; verificar `rig-guitar-library/irs/` e `rig-guitar-library/presets/` em outro dispositivo após o provedor terminar de sincronizar.
- Se não houver suporte a diretórios, exportar ZIP pelo seletor de arquivos do Drive.
- Testar cancelamento, falta de rede, permissão revogada e pasta removida; a biblioteca interna deve permanecer intacta.
- Exportar antes de desinstalar. Não há verificação automática do e-mail ou sincronização cloud em segundo plano.

## Limites conhecidos

- Motor AAudio próprio, sem medição de latência em telefone nesta sessão.
- A captura usa mono/48 kHz; interfaces que não aceitem essa rota exigem investigação específica.
- A convolução acrescenta um bloco de 128 amostras; IRs são limitados a 8192 amostras após conversão.
- Respostas de gabinete são sintéticas, não capturas medidas. Presets de artistas são aproximações de parâmetros.
- A prévia web e o motor nativo têm DSPs diferentes; use o APK para avaliar o timbre final.
