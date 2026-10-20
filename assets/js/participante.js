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
      if (aba.getAttribute("data-aba") === "votacao") atualizarVotacao();
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
  // A pergunta, a rodada e se a votação está aberta vêm da planilha (são
  // definidas no painel de controle). Todos os celulares consultam esse
  // estado de tempos em tempos: quando você ativa outra pergunta, os
  // botões Sim/Não voltam sozinhos, já com a pergunta nova.
  var botoesVoto = Array.prototype.slice.call(document.querySelectorAll(".btn-voto"));
  var INTERVALO_PLACAR = Math.max(5000, CFG.INTERVALO_PLACAR_CELULAR_MS || 8000);
  var timerPlacar = null;
  var buscando = false;
  var estado = null; // última resposta do placar: { rodada, pergunta, aberta, sim, nao }

  function mostrarErro(el, msg) {
    el.textContent = msg;
    el.hidden = !msg;
  }

  function votoAtual() {
    var voto = store.get(CHAVE_VOTO);
    return voto === "SIM" || voto === "NAO" ? voto : null;
  }

  // Sem pergunta ativada no painel, usa a do config.js.
  function textoPergunta(r) {
    return (r && r.pergunta) || CFG.PERGUNTA_VOTACAO || "";
  }

  function mostrarEstado(id) {
    ["votacao-form", "votacao-ok", "votacao-fechada"].forEach(function (outro) {
      $(outro).hidden = outro !== id;
    });
  }

  function mostrarVotoRegistrado(voto) {
    $("voto-registrado").classList.toggle("eh-nao", voto === "NAO");
    $("voto-texto").textContent = voto === "NAO" ? "Não" : "Sim";
    mostrarEstado("votacao-ok");
  }

  function habilitarVoto(sim) {
    botoesVoto.forEach(function (b) { b.disabled = !sim; });
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
   * Aplica o estado vindo da planilha. Se a rodada mudou (pergunta nova
   * ou votação zerada), o voto guardado no aparelho deixa de valer.
   */
  function aplicarEstado(r) {
    var anterior = estado;
    estado = r;
    var rodada = String(r.rodada || 1);
    var aberta = r.aberta !== false;
    var mudouRodada = !!anterior && String(anterior.rodada) !== rodada;

    if (votoAtual() && store.get(CHAVE_RODADA) !== rodada) {
      store.remove(CHAVE_VOTO);
      store.remove(CHAVE_RODADA);
      mudouRodada = true;
    }

    var html = Util.destacar(textoPergunta(r));
    $("pergunta-enquete").innerHTML = html;
    $("pergunta-enquete").classList.remove("carregando-texto");
    $("pergunta-votada").innerHTML = html;

    var status = $("status-votacao");
    status.classList.remove("verificando");
    status.classList.toggle("aguardando", !aberta);
    $("status-votacao-texto").textContent = aberta ? "Votação aberta" : "Aguardando liberação";

    var voto = votoAtual();
    if (voto) {
      mostrarVotoRegistrado(voto);
      renderMiniPlacar(r);
      document.querySelector(".mini-placar").classList.toggle("encerrada", !aberta);
      $("mini-titulo-texto").textContent = aberta ? "Resultado em tempo real" : "Votação parada • resultado final";
    } else if (aberta) {
      if (mudouRodada) $("aviso-rodada").hidden = false;
      habilitarVoto(true);
      mostrarEstado("votacao-form");
    } else {
      $("aviso-rodada").hidden = true;
      mostrarEstado("votacao-fechada");
    }
  }

  // Busca o estado da votação (e o placar) na planilha.
  function atualizarVotacao() {
    clearTimeout(timerPlacar);
    if (buscando) return;
    buscando = true;

    API.placar()
      .then(function (r) {
        mostrarErro($("votacao-erro"), "");
        aplicarEstado(r);
      })
      .catch(function (err) {
        console.warn("Não foi possível atualizar a votação.", err);
        if (!estado) mostrarErro($("votacao-erro"), "Não foi possível carregar a votação. Tentando de novo...");
      })
      .then(function () {
        buscando = false;
        agendar();
      });
  }

  // Próxima atualização, só com a aba de votação visível. O intervalo varia
  // um pouco para os celulares não consultarem a planilha todos juntos.
  function agendar() {
    clearTimeout(timerPlacar);
    if (document.visibilityState !== "visible" || $("painel-votacao").hidden) return;
    timerPlacar = setTimeout(atualizarVotacao, INTERVALO_PLACAR * (0.85 + Math.random() * 0.3));
  }

  function votar(voto, botao) {
    if (!estado) return;
    mostrarErro($("votacao-erro"), "");
    $("aviso-rodada").hidden = true;
    habilitarVoto(false);
    botao.classList.add("carregando");

    API.votar(voto, estado.rodada)
      .then(function (resp) {
        // Se o aparelho já tinha votado, a planilha devolve o voto original.
        store.set(CHAVE_VOTO, resp.voto || voto);
        store.set(CHAVE_RODADA, String(resp.rodada || estado.rodada || 1));
        document.querySelector(".mini-placar").classList.add("aguardando");
        // A resposta do voto já traz o placar; se não trouxer, busca.
        if (resp.placar) {
          aplicarEstado(resp.placar);
          agendar();
        } else {
          mostrarVotoRegistrado(resp.voto || voto);
          atualizarVotacao();
        }
        $("votacao-ok").querySelector(".titulo-ok").focus();
      })
      .catch(function (err) {
        console.error(err);
        // Pergunta trocada ou votação encerrada: mostra o motivo e recarrega.
        mostrarErro($("votacao-erro"), err.definitivo ? err.message :
          "Não foi possível registrar seu voto. Verifique sua conexão e tente novamente.");
        if (err.definitivo) atualizarVotacao();
      })
      .then(function () {
        if (!$("votacao-form").hidden) habilitarVoto(true);
        botao.classList.remove("carregando");
      });
  }

  botoesVoto.forEach(function (botao) {
    botao.addEventListener("click", function () { votar(botao.getAttribute("data-voto"), botao); });
  });

  // Quem já votou neste aparelho vê direto o voto (o placar chega em seguida).
  // Os botões só são liberados depois de saber qual é a pergunta da vez.
  habilitarVoto(false);
  if (votoAtual()) {
    document.querySelector(".mini-placar").classList.add("aguardando");
    mostrarVotoRegistrado(votoAtual());
  }
  atualizarVotacao();

  // Pausa com a tela apagada/outro app; ao voltar, atualiza na hora.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") atualizarVotacao();
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
