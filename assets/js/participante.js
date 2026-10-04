/* =====================================================================
   Página do participante (index.html): abas Votação e Perguntas
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.EVENTO_CONFIG || {};
  var store = Util.store;
  var CHAVE_VOTO = "iaunip_voto";
  var CHAVE_RODADA = "iaunip_voto_rodada";
  var CHAVE_NOME = "iaunip_nome";

  function $(id) { return document.getElementById(id); }

  /* ---------- ABAS ---------- */
  var abas = Array.prototype.slice.call(document.querySelectorAll(".aba"));

  function ativarAba(nome, focar) {
    abas.forEach(function (aba) {
      var ativa = aba.getAttribute("data-aba") === nome;
      aba.setAttribute("aria-selected", ativa ? "true" : "false");
      aba.tabIndex = ativa ? 0 : -1;
      $(aba.getAttribute("aria-controls")).hidden = !ativa;
      if (ativa && focar) aba.focus();
    });
    document.querySelector(".abas").setAttribute("data-ativa", nome);
    if (history.replaceState) history.replaceState(null, "", "#" + nome);
  }

  abas.forEach(function (aba, i) {
    aba.addEventListener("click", function () {
      ativarAba(aba.getAttribute("data-aba"));
      if (aba.getAttribute("data-aba") === "votacao") atualizarPlacar();
    });
    aba.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var prox = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length];
      ativarAba(prox.getAttribute("data-aba"), true);
    });
  });

  // Permite links diretos: index.html#perguntas
  ativarAba(location.hash === "#perguntas" ? "perguntas" : "votacao");

  /* ---------- VOTAÇÃO ---------- */
  $("pergunta-enquete").innerHTML = Util.destacar(CFG.PERGUNTA_VOTACAO || "");

  var botoesVoto = Array.prototype.slice.call(document.querySelectorAll(".btn-voto"));
  var INTERVALO_PLACAR = Math.max(5000, CFG.INTERVALO_PLACAR_CELULAR_MS || 8000);
  var timerPlacar = null;
  var buscandoPlacar = false;

  function mostrarErro(el, msg) {
    el.textContent = msg;
    el.hidden = !msg;
  }

  function jaVotou() { return !!store.get(CHAVE_VOTO); }

  function mostrarVotoRegistrado(voto, focar) {
    var caixa = $("voto-registrado");
    caixa.classList.toggle("eh-nao", voto === "NAO");
    $("voto-texto").textContent = voto === "NAO" ? "Não" : "Sim";
    document.querySelector(".mini-placar").classList.add("aguardando");
    $("votacao-form").hidden = true;
    $("votacao-ok").hidden = false;
    if (focar) $("votacao-ok").querySelector(".titulo-ok").focus();
  }

  // Volta para os botões Sim/Não (usado quando a votação é zerada).
  function liberarNovoVoto() {
    clearTimeout(timerPlacar);
    store.remove(CHAVE_VOTO);
    store.remove(CHAVE_RODADA);
    $("votacao-ok").hidden = true;
    $("votacao-form").hidden = false;
    $("aviso-rodada").hidden = false;
  }

  function renderMiniPlacar(r) {
    var sim = Number(r.sim) || 0;
    var nao = Number(r.nao) || 0;
    var p = Util.percentuais(sim, nao);
    $("mini-barra-sim").style.width = p.sim + "%";
    $("mini-barra-nao").style.width = p.nao + "%";
    $("mini-pct-sim").textContent = p.sim + "%";
    $("mini-pct-nao").textContent = p.nao + "%";
    $("mini-votos-sim").textContent = Util.formatarNumero(sim);
    $("mini-votos-nao").textContent = Util.formatarNumero(nao);
    $("mini-total").textContent = Util.formatarNumero(sim + nao);
    document.querySelector(".mini-placar").classList.remove("aguardando");
  }

  /*
   * Busca o placar para quem já votou. A mesma resposta traz a rodada:
   * se ela mudou, a votação foi zerada e os botões Sim/Não voltam.
   */
  function atualizarPlacar() {
    clearTimeout(timerPlacar);
    if (!jaVotou() || buscandoPlacar) return;
    buscandoPlacar = true;

    API.placar()
      .then(function (r) {
        if (!jaVotou()) return;
        if (r.rodada != null && String(r.rodada) !== store.get(CHAVE_RODADA)) {
          liberarNovoVoto();
          return;
        }
        renderMiniPlacar(r);
      })
      .catch(function (err) { console.warn("Não foi possível atualizar o placar.", err); })
      .then(function () {
        buscandoPlacar = false;
        agendarPlacar();
      });
  }

  // Próxima atualização, só com a tela de voto visível. O intervalo varia
  // um pouco para os celulares não consultarem a planilha todos juntos.
  function agendarPlacar() {
    clearTimeout(timerPlacar);
    if (!jaVotou() || document.visibilityState !== "visible" || $("painel-votacao").hidden) return;
    timerPlacar = setTimeout(atualizarPlacar, INTERVALO_PLACAR * (0.85 + Math.random() * 0.3));
  }

  function votar(voto, botao) {
    mostrarErro($("votacao-erro"), "");
    $("aviso-rodada").hidden = true;
    botoesVoto.forEach(function (b) { b.disabled = true; });
    botao.classList.add("carregando");

    API.votar(voto)
      .then(function (resp) {
        // Se o aparelho já tinha votado, a planilha devolve o voto original.
        var registrado = resp.voto || voto;
        store.set(CHAVE_VOTO, registrado);
        store.set(CHAVE_RODADA, String(resp.rodada || 1));
        mostrarVotoRegistrado(registrado, true);
        // A resposta do voto já traz o placar; se não trouxer, busca.
        if (resp.placar) {
          renderMiniPlacar(resp.placar);
          agendarPlacar();
        } else {
          atualizarPlacar();
        }
      })
      .catch(function (err) {
        console.error(err);
        mostrarErro($("votacao-erro"), "Não foi possível registrar seu voto. Verifique sua conexão e tente novamente.");
      })
      .then(function () {
        botoesVoto.forEach(function (b) { b.disabled = false; });
        botao.classList.remove("carregando");
      });
  }

  botoesVoto.forEach(function (botao) {
    botao.addEventListener("click", function () { votar(botao.getAttribute("data-voto"), botao); });
  });

  // Quem já votou neste aparelho vê direto o voto e o placar.
  var votoSalvo = store.get(CHAVE_VOTO);
  if (votoSalvo === "SIM" || votoSalvo === "NAO") {
    mostrarVotoRegistrado(votoSalvo, false);
    atualizarPlacar();
  }

  // Pausa com a tela apagada/outro app; ao voltar, atualiza na hora.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") atualizarPlacar();
    else clearTimeout(timerPlacar);
  });

  /* ---------- PERGUNTAS ---------- */
  var form = $("pergunta-form");
  var campoNome = $("campo-nome");
  var campoPergunta = $("campo-pergunta");
  var btnEnviar = $("btn-enviar");

  var nomeSalvo = store.get(CHAVE_NOME);
  if (nomeSalvo) campoNome.value = nomeSalvo;

  function atualizarContador() {
    $("contador-pergunta").textContent = campoPergunta.value.length;
  }
  campoPergunta.addEventListener("input", atualizarContador);

  [campoNome, campoPergunta].forEach(function (c) {
    c.addEventListener("input", function () { c.closest(".entrada").classList.remove("invalido"); });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var nome = campoNome.value.trim().replace(/\s+/g, " ");
    var pergunta = campoPergunta.value.trim();
    var erroEl = $("pergunta-erro");

    if (nome.length < 2) {
      campoNome.closest(".entrada").classList.add("invalido");
      campoNome.focus();
      return mostrarErro(erroEl, "Por favor, informe seu nome.");
    }
    if (pergunta.length < 5) {
      campoPergunta.closest(".entrada").classList.add("invalido");
      campoPergunta.focus();
      return mostrarErro(erroEl, "Escreva sua pergunta antes de enviar.");
    }

    mostrarErro(erroEl, "");
    btnEnviar.disabled = true;
    btnEnviar.classList.add("carregando");
    btnEnviar.querySelector("span").textContent = "Enviando...";

    API.enviarPergunta(nome, pergunta)
      .then(function () {
        store.set(CHAVE_NOME, nome);
        $("resumo-nome").textContent = nome;
        $("resumo-pergunta").textContent = pergunta;
        form.hidden = true;
        $("pergunta-ok").hidden = false;
        $("pergunta-ok").querySelector(".titulo-ok").focus();
      })
      .catch(function (err) {
        console.error(err);
        mostrarErro(erroEl, "Não foi possível enviar sua pergunta. Verifique sua conexão e tente novamente.");
      })
      .then(function () {
        btnEnviar.disabled = false;
        btnEnviar.classList.remove("carregando");
        btnEnviar.querySelector("span").textContent = "Enviar pergunta";
      });
  });

  $("btn-outra").addEventListener("click", function () {
    campoPergunta.value = "";
    atualizarContador();
    $("pergunta-ok").hidden = true;
    form.hidden = false;
    campoPergunta.focus();
  });
})();
