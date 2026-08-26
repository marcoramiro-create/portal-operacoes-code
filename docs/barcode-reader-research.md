# Leitura de código de barras de NF: conclusões técnicas

## Problema observado

O leitor baseado em ZXing abriu a câmera, mas não reconheceu o código de barras da NF de forma confiável em iOS, Android e computador, mesmo com Code 128 priorizado.

## Alternativa avaliada

O Quagga2 é voltado a códigos de barras lineares e suporta leitura contínua por câmera. A documentação do pacote informa suporte ao fluxo de câmera com `MediaDevices`, inclusive no Safari para iOS, e disponibiliza API para selecionar dispositivos de vídeo, liberar a câmera e aplicar restrições de câmera.

Para a chave de acesso da NF, o decodificador deve ser configurado para `code_128_reader`, com câmera traseira preferida no celular. Em aparelhos com mais de uma câmera traseira, a seleção do dispositivo pode ser necessária porque uma lente grande-angular pode prejudicar o foco no código linear.

## Decisão de implementação

Substituir o decodificador ZXing de vídeo contínuo por Quagga2 no modo de código de barras. Manter o ZXing somente como alternativa de QR Code, sem disputar a mesma câmera durante o modo de leitura de barras.

## Fontes consultadas

- MDN — `getUserMedia`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Quagga2 — pacote e documentação: https://www.npmjs.com/package/@ericblade/quagga2
- Quagga2 — discussão de suporte no Safari iOS: https://github.com/ericblade/quagga2/issues/351
- ZXing — discussão de Code 128: https://github.com/zxing-js/library/issues/566
