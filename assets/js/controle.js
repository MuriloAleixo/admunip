/* =====================================================================
   Painel de controle (controle.html)
   - Votação: escrever, editar, excluir e ativar as perguntas que o
     público vota (Sim/Não); encerrar/reabrir e zerar a votação
   - Perguntas do público: escolher quais vão para o telão e qual
     aparece agora
   Todas as ações exigem a senha de administrador (SENHA_ADMIN no
   Google Apps Script). A senha fica só nesta aba do navegador.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.EVENTO_CONFIG || {};
  var INTERVALO = 4000;
  var CHAVE_SENHA = "iaunip_admin_senha";
  function $(id) { return document.getElementById(id); }

  var senha = "";
  var dados = null;        // última resposta da planilha
  var assinatura = "";     // para só redesenhar quando algo mudar
  var timer = null;
  var buscando = false;
  var ocupado = 0;         // ações em andamento (a atualização automática espera)
  var versao = 0;          // descarta leituras que começaram antes de uma ação
  var falhas = 0;
  var editandoId = null;
  var filtro = "fora";

  var sessao = {
    get: function () { try { return sessionStorage.getItem(CHAVE_SENHA) || ""; } catch (e) { return ""; } },
    set: function (v) { try { sessionStorage.setItem(CHAVE_SENHA, v); } catch (e) { /* sem storage */ } },
    remove: function () { try { sessionStorage.removeItem(CHAVE_SENHA); } catch (e) { /* sem storage */ } },
  };

  /* ---------- aviso rápido ---------- */
  var toastTimer = null;
  function toast(msg, erro) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.toggle("erro", !!erro);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, erro ? 6000 : 3500);
  }

  /* ---------- janela de confirmação ---------- */
  var modal = $("modal-confirmar");
  var aoConfirmar = null;

  function confirmar(titulo, texto, rotuloOk, perigo, acao) {
    $("confirmar-titulo").textContent = titulo;
    $("confirmar-texto").innerHTML = texto;
    $("confirmar-ok").querySelector("span").textContent = rotuloOk;
    $("confirmar-ok").classList.toggle("btn-perigo", !!perigo);
    aoConfirmar = acao;
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
    $("confirmar-ok").focus();
  }
  function fecharModal() {
    aoConfirmar = null;
    if (typeof modal.close === "function") modal.close();
    else modal.removeAttribute("open");
  }
  $("confirmar-cancelar").addEventListener("click", fecharModal);
  $("confirmar-ok").addEventListener("click", function () {
    var acao = aoConfirmar;
    fecharModal();
    if (acao) acao();
  });

  /* ---------- LOGIN ---------- */
  function mostrarPainel(sim) {
    $("tela-login").hidden = sim;
    $("tela-controle").hidden = !sim;
  }

  function sair(msg) {
    clearTimeout(timer);
    senha = "";
    dados = null;
    assinatura = "";
    sessao.remove();
    mostrarPainel(false);
    $("login-senha").value = "";
    $("login-erro").textContent = msg || "";
    $("login-erro").hidden = !msg;
    $("login-senha").focus();
  }

  $("form-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var tentativa = $("login-senha").value;
    var btn = $("btn-entrar");
    if (!tentativa && !API.demo) {
      $("login-erro").textContent = "Digite a senha de administrador.";
      $("login-erro").hidden = false;
      return;
    }
    $("login-erro").hidden = true;
    btn.disabled = true;
    btn.classList.add("carregando");

    API.admin("admin", tentativa)
      .then(function (r) {
        senha = tentativa;
        sessao.set(senha);
        mostrarPainel(true);
        receber(r);
        agendar();
      })
      .catch(function (err) {
        $("login-erro").textContent = err.definitivo ? err.message : "Não foi possível conectar à planilha. Tente novamente.";
        $("login-erro").hidden = false;
        $("login-senha").select();
      })
      .then(function () {
        btn.disabled = false;
        btn.classList.remove("carregando");
      });
  });

  $("btn-sair").addEventListener("click", function () { sair(""); });

  /* ---------- SINCRONIA COM A PLANILHA ---------- */
  function atualizar() {
    clearTimeout(timer);
    if (!senha && !API.demo) return;
    if (buscando || ocupado) return agendar();
    buscando = true;
    var minha = versao;

    API.admin("admin", senha)
      .then(function (r) {
        if (minha === versao) receber(r);
      })
      .catch(function (err) {
        if (err.message === "Senha incorreta.") return sair("A senha mudou. Entre de novo.");
        falhas++;
        if (falhas >= 2) marcarSincronia(false);
      })
      .then(function () {
        buscando = false;
        agendar();
      });
  }

  function agendar() {
    clearTimeout(timer);
    if ($("tela-controle").hidden || document.visibilityState !== "visible") return;
    timer = setTimeout(atualizar, INTERVALO);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") atualizar();
    else clearTimeout(timer);
  });

  function marcarSincronia(ok) {
    $("sincronia").classList.toggle("falha", !ok);
    if (ok) {
      var d = new Date();
      $("sincronia-texto").textContent = "Atualizado às " +
        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" +
        String(d.getSeconds()).padStart(2, "0");
    } else {
      $("sincronia-texto").textContent = "Reconectando à planilha...";
    }
  }

  function receber(r) {
    falhas = 0;
    marcarSincronia(true);
    var nova = JSON.stringify(r);
    if (nova === assinatura) return;
    assinatura = nova;
    dados = r;
    render();
  }

  /*
   * Executa uma ação do painel. A resposta já traz todos os dados
   * atualizados, então a tela muda na hora.
   */
  function executar(acao, extra, botao, msgOk) {
    ocupado++;
    versao++;
    if (botao) {
      botao.disabled = true;
      botao.classList.add("carregando");
    }
    return API.admin(acao, senha, extra)
      .then(function (r) {
        if (r.dados) receber(r.dados);
        if (msgOk) toast(typeof msgOk === "function" ? msgOk(r) : msgOk);
        return r;
      })
      .catch(function (err) {
        if (err.message === "Senha incorreta.") {
          sair("A senha mudou. Entre de novo.");
        } else {
          toast(err.definitivo ? err.message : "Não foi possível conectar à planilha. Tente novamente.", true);
        }
        throw err;
      })
      .then(function (r) {
        terminar();
        return r;
      }, function (err) {
        terminar();
        throw err;
      });

    function terminar() {
      ocupado--;
      if (botao) {
        botao.disabled = false;
        botao.classList.remove("carregando");
      }
    }
  }

  /* ---------- DESENHO DA TELA ---------- */
  function render() {
    if (!dados) return;
    renderVotacao();
    renderEnquetes();
    renderPerguntas();
  }

  function renderVotacao() {
    var aberta = dados.aberta !== false;
    var texto = dados.pergunta || CFG.PERGUNTA_VOTACAO || "";
    var chip = $("chip-votacao");
    chip.textContent = aberta ? "Votação aberta" : "Votação parada";
    chip.className = "chip " + (aberta ? "chip-verde" : "chip-cinza");
    $("ctl-rodada").textContent = dados.rodada;
    $("em-votacao").classList.toggle("encerrada", !aberta);

    var p = $("ctl-pergunta");
    if (texto) {
      p.innerHTML = Util.destacar(texto) +
        (dados.pergunta ? "" : ' <small class="item-meta">(pergunta padrão do config.js)</small>');
    } else {
      p.textContent = "Nenhuma pergunta ativa. Escreva uma abaixo e clique em Salvar e ativar.";
    }

    var pl = dados.placar || {};
    var sim = Number(pl.sim) || 0, nao = Number(pl.nao) || 0;
    var pct = Util.percentuais(sim, nao);
    $("ctl-barra-sim").style.width = pct.sim + "%";
    $("ctl-barra-nao").style.width = pct.nao + "%";
    $("ctl-pct-sim").textContent = pct.sim + "%";
    $("ctl-pct-nao").textContent = pct.nao + "%";
    $("ctl-votos-sim").textContent = Util.formatarNumero(sim);
    $("ctl-votos-nao").textContent = Util.formatarNumero(nao);
    $("ctl-total").textContent = Util.formatarNumero(sim + nao);
    document.querySelector("#em-votacao .mini-placar").classList.remove("aguardando");

    var btn = $("btn-abrir-fechar");
    btn.textContent = aberta ? "Parar votação" : "Liberar votação";
    btn.dataset.aberta = aberta ? "1" : "0";
  }

  function renderEnquetes() {
    var lista = dados.enquetes || [];
    var ul = $("lista-enquetes");
    $("qtd-enquetes").textContent = lista.length;

    if (!lista.length) {
      ul.innerHTML = '<li class="lista-vazia">Nenhuma pergunta salva ainda. Escreva a primeira acima.</li>';
      return;
    }

    var aberta = dados.aberta !== false;
    ul.innerHTML = lista.map(function (q) {
      var ativa = Number(q.id) === Number(dados.enqueteAtiva);
      var chip = ativa
        ? '<span class="chip ' + (aberta ? "chip-verde" : "chip-cinza") + '">' + (aberta ? "Em votação" : "Parada") + "</span>"
        : "";
      return (
        '<li class="item-controle' + (ativa ? " ativo" : "") + '" data-id="' + q.id + '">' +
          '<div class="item-corpo">' +
            '<p class="item-texto">' + Util.destacar(q.pergunta) + "</p>" +
            '<p class="item-meta">#' + q.id + (q.criada ? " · criada " + Util.escapeHtml(q.criada) : "") + chip + "</p>" +
          "</div>" +
          '<div class="item-acoes">' +
            '<button type="button" class="' + (ativa ? "btn-secundario" : "btn-principal") + '" data-acao="ativar">' +
              (ativa ? "Reiniciar votação" : "Ativar") + "</button>" +
            '<button type="button" class="btn-secundario" data-acao="editar">Editar</button>' +
            '<button type="button" class="btn-secundario btn-perigo-suave" data-acao="excluir">Excluir</button>' +
          "</div>" +
        "</li>"
      );
    }).join("");
  }

  function renderPerguntas() {
    var todas = (dados.perguntas || []).slice();
    var noTelao = todas.filter(function (p) { return p.exibir; });
    var fora = todas.filter(function (p) { return !p.exibir; });
    $("qtd-fora").textContent = fora.length;
    $("qtd-telao").textContent = noTelao.length;
    $("qtd-todas").textContent = todas.length;

    // "No telão" segue a ordem do telão; as outras mostram as mais novas primeiro.
    var lista = filtro === "telao" ? noTelao : (filtro === "fora" ? fora : todas).reverse();
    var ul = $("lista-perguntas");

    if (!lista.length) {
      var vazio = {
        fora: "Nenhuma pergunta nova. As perguntas enviadas pelo público aparecem aqui.",
        telao: "Nenhuma pergunta no telão. Escolha perguntas na aba Fora do telão.",
        todas: "Nenhuma pergunta recebida ainda.",
      };
      ul.innerHTML = '<li class="lista-vazia">' + vazio[filtro] + "</li>";
      return;
    }

    ul.innerHTML = lista.map(function (p) {
      var naTela = p.exibir && Number(p.id) === Number(dados.destaque);
      var chip = naTela
        ? '<span class="chip chip-ciano">Na tela agora</span>'
        : p.exibir ? '<span class="chip chip-azul">No telão</span>' : "";
      var acoes = p.exibir
        ? (naTela ? "" : '<button type="button" class="btn-principal" data-acao="mostrar">Mostrar agora</button>') +
          '<button type="button" class="btn-secundario" data-acao="retirar">Retirar do telão</button>'
        : '<button type="button" class="btn-principal" data-acao="mostrar">Mostrar agora</button>' +
          '<button type="button" class="btn-secundario" data-acao="adicionar">Adicionar à fila</button>';
      return (
        '<li class="item-controle' + (p.exibir ? " no-telao" : "") + (naTela ? " destaque" : "") + '" data-id="' + p.id + '">' +
          '<div class="avatar mini" aria-hidden="true">' + Util.escapeHtml(Util.iniciais(p.nome)) + "</div>" +
          '<div class="item-corpo">' +
            '<p class="item-nome">' + Util.escapeHtml(p.nome) +
              '<small class="item-hora">' + (p.hora ? Util.escapeHtml(p.hora) + " · " : "") + "#" + p.id + "</small>" + chip + "</p>" +
            '<p class="item-texto">' + Util.destacar(p.pergunta) + "</p>" +
          "</div>" +
          '<div class="item-acoes">' + acoes + "</div>" +
        "</li>"
      );
    }).join("");
  }

  /* ---------- AÇÕES: VOTAÇÃO ---------- */
  var campoEnquete = $("campo-enquete");

  function atualizarContador() {
    $("contador-enquete").textContent = campoEnquete.value.length;
  }
  campoEnquete.addEventListener("input", function () {
    atualizarContador();
    campoEnquete.closest(".entrada").classList.remove("invalido");
  });

  function iniciarEdicao(q) {
    editandoId = q.id;
    campoEnquete.value = q.pergunta;
    atualizarContador();
    $("rotulo-enquete").textContent = "Editando a pergunta #" + q.id;
    $("btn-cancelar-edicao").hidden = false;
    $("btn-salvar-enquete").textContent = "Salvar alterações";
    $("form-enquete").scrollIntoView({ behavior: "smooth", block: "center" });
    campoEnquete.focus();
  }

  function encerrarEdicao() {
    editandoId = null;
    campoEnquete.value = "";
    atualizarContador();
    $("rotulo-enquete").textContent = "Nova pergunta para votação";
    $("btn-cancelar-edicao").hidden = true;
    $("btn-salvar-enquete").textContent = "Salvar";
    $("enquete-erro").hidden = true;
  }
  $("btn-cancelar-edicao").addEventListener("click", encerrarEdicao);

  function temVotos() {
    return dados && dados.placar && Number(dados.placar.total) > 0;
  }

  function salvarEnquete(ativar, botao) {
    var texto = campoEnquete.value.trim().replace(/\s+/g, " ");
    if (texto.length < 5) {
      campoEnquete.closest(".entrada").classList.add("invalido");
      $("enquete-erro").textContent = "Escreva a pergunta (mínimo de 5 caracteres).";
      $("enquete-erro").hidden = false;
      campoEnquete.focus();
      return;
    }
    $("enquete-erro").hidden = true;

    function enviar() {
      var editando = editandoId;
      executar("salvarEnquete", { id: editando, pergunta: texto, ativar: ativar }, botao,
        ativar ? "Pergunta ativada! O público já pode votar." : editando ? "Pergunta atualizada." : "Pergunta salva.")
        .then(encerrarEdicao, function () { /* erro já avisado */ });
    }

    if (ativar) {
      confirmar("Ativar esta pergunta?",
        "<strong>" + Util.escapeHtml(texto) + "</strong><br><br>" + avisoTroca(),
        "Ativar agora", false, enviar);
    } else {
      enviar();
    }
  }

  function avisoTroca() {
    return temVotos()
      ? "Os " + Util.formatarNumero(dados.placar.total) + " votos atuais vão para o histórico da planilha e a votação recomeça do zero com esta pergunta."
      : "A votação abre com esta pergunta nos celulares e no telão do placar.";
  }

  $("form-enquete").addEventListener("submit", function (e) {
    e.preventDefault();
    salvarEnquete(false, $("btn-salvar-enquete"));
  });
  $("btn-salvar-ativar").addEventListener("click", function () {
    salvarEnquete(true, $("btn-salvar-ativar"));
  });

  $("lista-enquetes").addEventListener("click", function (e) {
    var botao = e.target.closest("button[data-acao]");
    if (!botao || !dados) return;
    var id = Number(botao.closest("li").dataset.id);
    var q = (dados.enquetes || []).filter(function (x) { return Number(x.id) === id; })[0];
    if (!q) return;
    var acao = botao.dataset.acao;

    if (acao === "editar") {
      iniciarEdicao(q);
    } else if (acao === "ativar") {
      var ativa = id === Number(dados.enqueteAtiva);
      confirmar(ativa ? "Reiniciar a votação?" : "Ativar esta pergunta?",
        "<strong>" + Util.escapeHtml(q.pergunta) + "</strong><br><br>" + avisoTroca(),
        ativa ? "Reiniciar" : "Ativar agora", false, function () {
          executar("ativarEnquete", { id: id }, botao, "Pergunta ativada! O público já pode votar.")
            .catch(function () { /* erro já avisado */ });
        });
    } else if (acao === "excluir") {
      confirmar("Excluir esta pergunta?",
        "<strong>" + Util.escapeHtml(q.pergunta) + "</strong><br><br>Ela sai da lista de perguntas salvas. Os votos que ela já recebeu continuam no histórico.",
        "Excluir", true, function () {
          executar("excluirEnquete", { id: id }, botao, "Pergunta excluída.")
            .then(function () { if (editandoId === id) encerrarEdicao(); }, function () { /* erro já avisado */ });
        });
    }
  });

  $("btn-abrir-fechar").addEventListener("click", function () {
    var botao = this;
    var abrir = botao.dataset.aberta !== "1";
    if (abrir) {
      executar("abrirVotacao", { aberta: true }, botao, "Votação liberada! O público já pode votar.").catch(function () {});
    } else {
      confirmar("Parar a votação?",
        "Os celulares param de aceitar votos e mostram <strong>Aguardando liberação</strong>. O telão mostra o <strong>resultado final</strong>. Você pode liberar de novo depois.",
        "Parar votação", false, function () {
          executar("abrirVotacao", { aberta: false }, botao, "Votação parada. O público vê \"Aguardando liberação\".").catch(function () {});
        });
    }
  });

  $("btn-zerar-votos").addEventListener("click", function () {
    var botao = this;
    confirmar("Zerar os votos?",
      "O placar volta a <strong>zero</strong> com a mesma pergunta e todos poderão votar de novo. Os votos atuais vão para o histórico da planilha.",
      "Zerar agora", true, function () {
        executar("zerar", {}, botao, function (r) { return "Votação zerada! Nova rodada aberta (rodada " + r.rodada + ")."; })
          .catch(function () {});
      });
  });

  /* ---------- AÇÕES: PERGUNTAS DO PÚBLICO ---------- */
  var filtros = Array.prototype.slice.call(document.querySelectorAll(".filtro"));
  filtros.forEach(function (b) {
    b.addEventListener("click", function () {
      filtro = b.dataset.filtro;
      filtros.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
      if (dados) renderPerguntas();
    });
  });

  $("lista-perguntas").addEventListener("click", function (e) {
    var botao = e.target.closest("button[data-acao]");
    if (!botao) return;
    var id = Number(botao.closest("li").dataset.id);
    var acao = botao.dataset.acao;

    if (acao === "mostrar") {
      executar("perguntaTelao", { id: id, exibir: true, destacar: true }, botao, "Pergunta enviada para a tela do telão.").catch(function () {});
    } else if (acao === "adicionar") {
      executar("perguntaTelao", { id: id, exibir: true }, botao, "Pergunta adicionada à fila do telão.").catch(function () {});
    } else if (acao === "retirar") {
      executar("perguntaTelao", { id: id, exibir: false }, botao, "Pergunta retirada do telão.").catch(function () {});
    }
  });

  $("btn-zerar-perguntas").addEventListener("click", function () {
    var botao = this;
    confirmar("Zerar as perguntas?",
      "O telão fica <strong>vazio</strong> e esta lista recomeça. As perguntas atuais não são perdidas: vão para a aba <strong>Histórico de perguntas</strong> da planilha.",
      "Zerar agora", true, function () {
        executar("zerarPerguntas", {}, botao, "Perguntas zeradas! O telão está pronto para novas perguntas.").catch(function () {});
      });
  });

  /* ---------- INÍCIO ---------- */
  senha = sessao.get();
  if (senha || API.demo) {
    // Já entrou nesta aba: abre o painel direto (se a senha ainda valer).
    mostrarPainel(true);
    $("sincronia-texto").textContent = "Conectando...";
    API.admin("admin", senha)
      .then(function (r) { receber(r); agendar(); })
      .catch(function (err) {
        if (err.definitivo) sair(err.message);
        else { marcarSincronia(false); agendar(); }
      });
  } else {
    $("login-senha").focus();
  }
})();
