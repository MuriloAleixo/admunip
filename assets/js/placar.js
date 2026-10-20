/* =====================================================================
   Telão 1 (placar.html): placar da votação em tempo real
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.EVENTO_CONFIG || {};
  var INTERVALO = Math.max(1500, CFG.INTERVALO_PLACAR_MS || 3000);
  function $(id) { return document.getElementById(id); }

  var atual = { sim: 0, nao: 0, total: 0 };
  var falhas = 0;
  var perguntaAtual = null;
  var abertaAtual = null;
  var TEXTO_AO_VIVO = $("ao-vivo-texto").innerHTML;

  // Pergunta ativada no painel de controle (sem nenhuma, usa a do config.js).
  function renderPergunta(texto) {
    texto = texto || CFG.PERGUNTA_VOTACAO || "";
    if (texto === perguntaAtual) return;
    perguntaAtual = texto;
    $("placar-pergunta").innerHTML = Util.destacar(texto);
  }

  // Votação encerrada no painel: o telão mostra o resultado final.
  function renderAberta(aberta) {
    if (aberta === abertaAtual) return;
    abertaAtual = aberta;
    $("rotulo-placar").textContent = aberta ? "Resultado em tempo real" : "Resultado final";
    $("chip-encerrada").hidden = aberta;
    $("ao-vivo-texto").innerHTML = aberta ? TEXTO_AO_VIVO : "A votação foi encerrada.<br>Este é o resultado final.";
    document.querySelector(".ao-vivo").classList.toggle("encerrada", !aberta);
  }

  // Anima um número de "de" até "para" no elemento.
  // Cada chamada cancela a animação anterior do mesmo elemento, para que
  // uma animação antiga nunca sobrescreva um valor mais novo.
  function animarNumero(el, de, para, sufixo) {
    sufixo = sufixo || "";
    var id = (el._animacao = (el._animacao || 0) + 1);
    if (de === para) { el.textContent = Util.formatarNumero(para) + sufixo; return; }
    var inicio = null, duracao = 700;
    function passo(t) {
      if (el._animacao !== id) return;
      if (!inicio) inicio = t;
      var p = Math.min(1, (t - inicio) / duracao);
      var v = Math.round(de + (para - de) * (1 - Math.pow(1 - p, 3)));
      el.textContent = Util.formatarNumero(v) + sufixo;
      if (p < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }

  function render(novo) {
    var pAnt = Util.percentuais(atual.sim, atual.nao);
    var pNovo = Util.percentuais(novo.sim, novo.nao);

    $("barra-sim").style.width = pNovo.sim + "%";
    $("barra-nao").style.width = pNovo.nao + "%";
    animarNumero($("pct-sim"), pAnt.sim, pNovo.sim, "%");
    animarNumero($("pct-nao"), pAnt.nao, pNovo.nao, "%");
    animarNumero($("votos-sim"), atual.sim, novo.sim);
    animarNumero($("votos-nao"), atual.nao, novo.nao);
    animarNumero($("total-votos"), atual.total, novo.total);

    document.querySelector(".linha-placar.sim").classList.toggle("lider", novo.sim > novo.nao);
    document.querySelector(".linha-placar.nao").classList.toggle("lider", novo.nao > novo.sim);
    atual = novo;
  }

  function atualizar() {
    return API.placar()
      .then(function (r) {
        falhas = 0;
        $("status-conexao").hidden = true;
        var sim = Number(r.sim) || 0, nao = Number(r.nao) || 0;
        renderPergunta(r.pergunta);
        renderAberta(r.aberta !== false);
        render({ sim: sim, nao: nao, total: sim + nao });
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

  atualizar();

  /* ---------- Zerar votação (operador do telão) ---------- */
  Util.ativarZerar({
    executar: API.zerar,
    aoZerar: function (r) {
      render({ sim: 0, nao: 0, total: 0 });
      return "Votação zerada! Nova rodada aberta (rodada " + r.rodada + ").";
    },
  });
})();
