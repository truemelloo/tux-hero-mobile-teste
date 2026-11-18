# TUX HERO — Versão mobile (Android / iPhone / tablets)

Mesmo site, mesmo código, mesmo link da Vercel. Em computadores nada muda; em aparelhos touch o jogo
ativa automaticamente a camada mobile.

## Como funciona

| Arquivo | Papel |
|---|---|
| `lib/tux-mobile.js` (novo) | Detecta o aparelho, aviso de rotação, tela cheia, botões touch, câmera, áudio iOS, modal do multijogador |
| `css/mobile.css` (novo) | Layout responsivo. **Toda regra está sob `html.tux-mobile`**, então não afeta o desktop |
| `index.html` | + metas (`viewport-fit=cover`, tema, web-app), + `mobile.css`, + `tux-mobile.js` |
| `lib/tux-unified-3d.js` | Ganchos pequenos, todos protegidos por `TuxMobile.active` (câmera, HUD, áudio, pausa externa) |
| `lib/tux-hero-ui.js` | 2 linhas: bloqueiam o MULTIJOGADOR no celular |

`bundle.js` (motor original), assets, músicas e o CSS desktop **não foram alterados**.

### Detecção (não usa só a largura da tela)
Celular/tablet = `userAgentData.mobile`, UA Android/iPhone/iPad, iPadOS ("site para computador" + multitouch) ou
apontador principal por dedo (`pointer: coarse` + `hover: none`). Notebook com tela touch continua sendo computador
(o apontador principal é mouse/touchpad). Para testar no PC: acrescente `?mobile=1` à URL (ou use o modo dispositivo do DevTools).

### Botões touch
- 5 botões (verde, vermelho, amarelo, azul, laranja) alinhados, por cálculo, abaixo das 5 pistas da guitarra 3D.
- Disparam os **mesmos eventos de teclado (A S D F G)** que o teclado físico. Os dois motores recebem as notas pelo
  caminho original: acertos, erros, combo, multiplicador, PowerMusic e pontuação não foram duplicados nem alterados.
- Multitouch real (um ponteiro por dedo). O dedo que escorrega para fora continua preso ao botão (notas longas).
- Não é "toque em qualquer lugar": sem tocar no botão da pista no tempo certo a nota é erro, como no teclado.

### Guitarra 3D
Mesmo Three.js e mesmos modelos. Só a câmera é recalculada (fórmula fechada, sem custo) para que a pista caiba na
tela baixa com os botões embaixo. No desktop os valores de câmera são os de antes (conferido nos testes).

### Orientação
- Celular em pé ao tocar JOGAR: aparece **📱 GIRE SEU CELULAR!** e a partida só começa ao girar.
- Girar para pé durante a música: pausa tudo (áudio, notas, relógio, PowerMusic); a pontuação é mantida; ao voltar
  para horizontal, a janela de pausa oferece CONTINUAR (contagem 3-2-1 e retomada sincronizada, sem reiniciar).
- Também pausa ao minimizar o app / trocar de aba / ligação que interrompe o áudio.
- Pede tela cheia + travamento de orientação quando o navegador permite (Android/Chrome). No iPhone o Safari não
  oferece essas APIs: vale o aviso visual. Dica: "Compartilhar → Adicionar à Tela de Início" abre em tela cheia.
- Tablets não são obrigados a ficar na horizontal.

### Áudio / sincronização
- iOS só libera `play()` em um `<audio>` que já tocou num toque do jogador. Há um `<audio>` persistente destravado no
  primeiro toque e reutilizado pelos dois motores (sem editar o `bundle.js`).
- Relógio de jogo = o do motor original (`audio.currentTime` no 3D, relógio próprio no Jogo Rápido). Nada foi trocado.

### Desempenho
Pixel ratio limitado (≤2, ≤1,5 em aparelhos fracos), sem MSAA em telas ≥2x, redução automática de resolução se o FPS
cair, Jogo Rápido não renderiza quando está só no menu, tela não apaga durante a partida (Wake Lock).

### Multijogador local
Continua visível no menu. No celular abre o modal **🖥️ MODO EXCLUSIVO PARA PC** e não inicia a partida (nem girando o
aparelho, nem pelo teclado). O bloqueio está no clique do menu e também em `TuxUnified3D.start({mode:'multi'})`.

## Testes realizados (Chromium/Playwright, emulação de dispositivos)

**Desktop — original vs. novo (mesma sequência nos dois):** menu (0 pixels diferentes), multijogador com 2 guitarras,
câmera idêntica (fov 30, 0/8/453), teclas P1/P2, pausa, 1 jogador (câmera fov 75, 0/0/150), Jogo Rápido (pontuação final
idêntica) e áudio. Sem nenhum erro de console. Única diferença: `TuxMobile.active=false` e `viewport-fit=cover`.

**Mobile (iPhone 13 paisagem/retrato, iPhone SE, Android 740×360 e 915×412, iPad paisagem/retrato):**
menus e todas as telas sem rolagem horizontal; gameplay 3D e Jogo Rápido com botões alinhados; multitouch com 3 e 5
dedos; pontuação via botões (17/17 acertos, ×2) e 0 pontos sem tocar; aviso de rotação no início e no meio; congelamento
total e retomada do mesmo ponto; pausa ao ir para segundo plano; áudio do Jogo Rápido no `<audio>` persistente;
importação de MP3 (497 notas geradas e jogadas no motor 3D); tela de resultados; modal do multijogador; adaptação de
resolução por FPS.

## Ainda precisa ser validado em aparelhos reais
Não houve acesso a iPhone nem Android físicos, e o teste foi em Chromium (não WebKit/Safari). Confirme em aparelho:
1. **iPhone/Safari:** som tocando na 1ª música (destravamento de áudio), multitouch, aviso de rotação, safe areas (notch).
2. **Android/Chrome:** tela cheia + travamento de orientação, Wake Lock.
3. **Latência:** o atraso de áudio varia com o aparelho (principalmente fone Bluetooth); não há calibração.
4. **Desempenho/aquecimento** em aparelhos de entrada, em partidas longas.
5. **Importação** de MP3 muito longo: decodificar consome bastante memória em celulares fracos.

## Observações sobre o jogo original (não alteradas)
- A faixa "Sweet Child O' Mine" carrega o MP3 de um servidor externo (S3); sem internet ela fica muda.
- O jogo não tem barra de progresso de música nem cronômetro na tela; o indicador existente é o PowerMusic (também congelado na pausa).
- No Jogo Rápido do **desktop**, pausar nos primeiros ~2 s deixa a música começar mesmo pausada (confirmado no original; mantido como está). No celular isso foi corrigido na camada mobile.
