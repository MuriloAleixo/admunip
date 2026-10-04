/* =====================================================================
   Telão 2 (perguntas.html): exibe as perguntas do público uma a uma
   Controles: botões na tela, setas ← → do teclado, barra de espaço,
   Page Up/Page Down (passadores de slide) e F para tela cheia.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.EVENTO_CONFIG || {};
  var INTERVALO = Math.max(2000, CFG.INTERVALO_PERGUNTAS_MS || 5000);
  var MAX_PONTOS = 9;
  function $(id) { return document.getElementById(id); }

  var lista = [];
  var indice = 0;
  var idAtual = null;
  var falhas = 0;
  var CHAVE_ID = "iaunip_telao_pergunta_atual";

  // Continua da última pergunta exibida caso a página seja recarregada.
  idAtual = Util.store.get(CHAVE_ID);

  // Conteúdo de "aguardando perguntas" (o que vem no HTML), para restaurar
  // quando a lista ficar vazia (por exemplo, depois de zerar).
  var VAZIO = {
    avatar: $("pergunta-avatar").textContent,
    nome: $("pergunta-nome").textContent,
    meta: $("pergunta-meta").textContent,
    texto: $("pergunta-texto").innerHTML,
  };

  function tamanhoTexto(texto) {
    var n = texto.length;
    if (n > 360) return "t-pp";
    if (n > 240) return "t-p";
    if (n > 140) return "t-m";
    return "t-g";
  }

  // Reduz a fonte até a pergunta caber inteira na caixa do telão.
  function ajustarTexto() {
    var el = $("pergunta-texto");
    el.style.fontSize = "";
    var tamanho = parseFloat(getComputedStyle(el).fontSize);
    var limite = 60;
    while (el.scrollHeight > el.clientHeight + 1 && tamanho > 14 && limite--) {
      tamanho = Math.max(14, tamanho * 0.94);
      el.style.fontSize = tamanho + "px";
    }
  }
  window.addEventListener("resize", ajustarTexto);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarTexto);

  function renderPontos() {
    var cont = $("pontos");
    var total = lista.length;
    cont.innerHTML = "";
    if (!total) return;
    var qtd = Math.min(total, MAX_PONTOS);
    // Janela de pontos que acompanha a pergunta atual.
    var inicio = Math.min(Math.max(0, indice - Math.floor(qtd / 2)), total - qtd);
    for (var i = inicio; i < inicio + qtd; i++) {
      var b = document.createElement("button");
      b.className = "ponto" + (i === indice ? " ativo" : "");
      b.setAttribute("aria-label", "Ir para a pergunta " + (i + 1));
      b.dataset.i = i;
      cont.appendChild(b);
    }
  }

  function render(animar) {
    var total = lista.length;
    $("pos-total").textContent = total;
    $("btn-anterior").disabled = indice <= 0;
    $("btn-proxima").disabled = indice >= total - 1;

    if (!total) {
      $("pos-atual").textContent = 0;
      $("pergunta-avatar").textContent = VAZIO.avatar;
      $("pergunta-nome").textContent = VAZIO.nome;
      $("pergunta-meta").textContent = VAZIO.meta;
      $("pergunta-texto").className = "pergunta-texto";
      $("pergunta-texto").innerHTML = VAZIO.texto;
      ajustarTexto();
      renderPontos();
      return;
    }

    var p = lista[indice];
    var caixa = $("pergunta-caixa");
    $("pos-atual").textContent = indice + 1;
    $("pergunta-avatar").textContent = Util.iniciais(p.nome);
    $("pergunta-nome").textContent = p.nome;
    $("pergunta-meta").textContent = p.hora ? "Enviada às " + p.hora : "Pergunta do público";
    var texto = $("pergunta-texto");
    texto.className = "pergunta-texto " + tamanhoTexto(p.pergunta || "");
    texto.innerHTML = Util.destacar(p.pergunta);
    ajustarTexto();

    if (animar) {
      caixa.classList.remove("entrar");
      void caixa.offsetWidth; // reinicia a animação
      caixa.classList.add("entrar");
    }
    renderPontos();
  }

  function irPara(i) {
    if (!lista.length) return;
    var novo = Math.max(0, Math.min(lista.length - 1, i));
    if (novo === indice && idAtual === String(lista[novo].id)) return;
    indice = novo;
    idAtual = String(lista[indice].id);
    Util.store.set(CHAVE_ID, idAtual);
    render(true);
  }

  function limparLista() {
    lista = [];
    indice = 0;
    idAtual = null;
    Util.store.remove(CHAVE_ID);
  }

  function atualizar() {
    return API.perguntas()
      .then(function (r) {
        falhas = 0;
        $("status-conexao").hidden = true;
        var nova = (r.perguntas || []).filter(function (p) { return p && p.pergunta; });
        var mudou = JSON.stringify(nova) !== JSON.stringify(lista);
        if (!mudou) return;

        var primeiraCarga = !lista.length;
        lista = nova;

        // Mantém a mesma pergunta na tela mesmo que a lista mude
        // (novas perguntas chegando ou alguma ocultada na planilha).
        var pos = -1;
        if (idAtual != null) {
          for (var i = 0; i < lista.length; i++) {
            if (String(lista[i].id) === String(idAtual)) { pos = i; break; }
          }
        }
        var trocou = pos === -1;
        indice = trocou ? Math.min(indice, Math.max(0, lista.length - 1)) : pos;
        if (lista.length) {
          idAtual = String(lista[indice].id);
          Util.store.set(CHAVE_ID, idAtual);
        } else {
          limparLista();
        }
        render(primeiraCarga || trocou);
      })
      .catch(function (err) {
        console.error(err);
        falhas++;
        if (falhas >= 2) {
          $("status-conexao").textContent = "Reconectando à planilha...";
          $("status-conexao").hidden = false;
        }
      })
      .then(function () { setTimeout(atualizar, INTERVALO); });
  }

  $("btn-proxima").addEventListener("click", function () { irPara(indice + 1); });
  $("btn-anterior").addEventListener("click", function () { irPara(indice - 1); });
  $("pontos").addEventListener("click", function (e) {
    var alvo = e.target.closest(".ponto");
    if (alvo) irPara(Number(alvo.dataset.i));
  });

  document.addEventListener("keydown", function (e) {
    if (e.target.matches("input, textarea") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault(); irPara(indice + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault(); irPara(indice - 1);
    } else if (e.key === "Home") {
      irPara(0);
    } else if (e.key === "End") {
      irPara(lista.length - 1);
    }
  });

  atualizar();

  /* ---------- Zerar perguntas (operador do telão) ---------- */
  Util.ativarZerar({
    executar: API.zerarPerguntas,
    aoZerar: function () {
      limparLista();
      render(false);
      return "Perguntas zeradas! O telão está pronto para novas perguntas.";
    },
  });
})();
