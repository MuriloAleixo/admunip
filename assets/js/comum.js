/* =====================================================================
   Código compartilhado pelas 3 páginas:
   - API: comunicação com o Google Apps Script (ou modo demonstração)
   - Utilitários: escape de HTML, destaque de palavras, formatação
   - Fundo animado com "rede neural"
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.EVENTO_CONFIG || {};
  var API_URL = (CFG.API_URL || "").trim();
  var DEMO = !API_URL;

  /* ---------- armazenamento local seguro ---------- */
  var store = {
    get: function (chave) {
      try { return localStorage.getItem(chave); } catch (e) { return null; }
    },
    set: function (chave, valor) {
      try { localStorage.setItem(chave, valor); } catch (e) { /* sem storage */ }
    },
    remove: function (chave) {
      try { localStorage.removeItem(chave); } catch (e) { /* sem storage */ }
    },
  };

  // Identificador anônimo do aparelho, usado para evitar voto duplicado.
  function idDispositivo() {
    var id = store.get("iaunip_dispositivo");
    if (!id) {
      id = "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      store.set("iaunip_dispositivo", id);
    }
    return id;
  }

  /* ---------- chamadas ao Google Apps Script ---------- */
  function lerResposta(resp) {
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.json().then(function (json) {
      if (!json || json.ok !== true) {
        // Erro de regra (ex.: senha incorreta): não adianta tentar de novo.
        var erro = new Error((json && json.erro) || "Resposta inválida");
        erro.definitivo = true;
        throw erro;
      }
      return json;
    });
  }

  function apiGet(acao) {
    var url = API_URL + (API_URL.indexOf("?") > -1 ? "&" : "?") +
      "acao=" + encodeURIComponent(acao) + "&t=" + Date.now();
    return fetch(url, { method: "GET", redirect: "follow", cache: "no-store" }).then(lerResposta);
  }

  // Content-Type text/plain evita a requisição "preflight" (CORS),
  // que o Google Apps Script não suporta.
  // Se a planilha estiver ocupada (muita gente votando junto), tenta de novo.
  function apiPost(dados, tentativa) {
    tentativa = tentativa || 1;
    return fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(dados),
    }).then(lerResposta).catch(function (err) {
      if (err.definitivo || tentativa >= 3) throw err;
      var espera = 1000 * tentativa + Math.random() * 1500;
      return new Promise(function (ok) { setTimeout(ok, espera); })
        .then(function () { return apiPost(dados, tentativa + 1); });
    });
  }

  /* ---------- modo demonstração (sem planilha) ---------- */
  function demoLer(chave, padrao) {
    try { return JSON.parse(store.get(chave)) || padrao; } catch (e) { return padrao; }
  }
  function atraso(valor) {
    return new Promise(function (ok) { setTimeout(function () { ok(valor); }, 450); });
  }
  function demoRodada() { return Number(store.get("iaunip_demo_rodada")) || 1; }
  var demo = {
    votar: function (voto) {
      var votos = demoLer("iaunip_demo_votos", {});
      var id = idDispositivo();
      var duplicado = !!votos[id];
      if (!duplicado) votos[id] = voto;
      store.set("iaunip_demo_votos", JSON.stringify(votos));
      return demo.placar().then(function (placar) {
        return atraso({ ok: true, voto: votos[id], duplicado: duplicado, rodada: demoRodada(), placar: placar });
      });
    },
    status: function () {
      return Promise.resolve({ ok: true, rodada: demoRodada() });
    },
    // No modo demonstração qualquer senha é aceita.
    zerar: function () {
      store.remove("iaunip_demo_votos");
      store.set("iaunip_demo_rodada", String(demoRodada() + 1));
      return atraso({ ok: true, rodada: demoRodada() });
    },
    zerarPerguntas: function () {
      var rodada = (Number(store.get("iaunip_demo_rodada_perguntas")) || 1) + 1;
      store.remove("iaunip_demo_perguntas");
      store.set("iaunip_demo_rodada_perguntas", String(rodada));
      return atraso({ ok: true, rodada: rodada });
    },
    enviarPergunta: function (nome, pergunta) {
      var lista = demoLer("iaunip_demo_perguntas", []);
      var item = { id: Date.now(), nome: nome, pergunta: pergunta, hora: horaAgora() };
      lista.push(item);
      store.set("iaunip_demo_perguntas", JSON.stringify(lista));
      return atraso({ ok: true, pergunta: item });
    },
    placar: function () {
      var votos = demoLer("iaunip_demo_votos", {});
      var sim = 0, nao = 0;
      Object.keys(votos).forEach(function (k) { if (votos[k] === "SIM") sim++; else nao++; });
      return Promise.resolve({ ok: true, sim: sim, nao: nao, total: sim + nao, rodada: demoRodada() });
    },
    perguntas: function () {
      return Promise.resolve({ ok: true, perguntas: demoLer("iaunip_demo_perguntas", []) });
    },
  };

  function horaAgora() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  window.API = {
    demo: DEMO,
    idDispositivo: idDispositivo,
    votar: function (voto) {
      if (DEMO) return demo.votar(voto);
      return apiPost({ acao: "votar", voto: voto, dispositivo: idDispositivo() });
    },
    enviarPergunta: function (nome, pergunta) {
      if (DEMO) return demo.enviarPergunta(nome, pergunta);
      return apiPost({ acao: "pergunta", nome: nome, pergunta: pergunta, dispositivo: idDispositivo() });
    },
    // Rodada atual da votação (sobe a cada "zerar votação").
    status: function () { return DEMO ? demo.status() : apiGet("status"); },
    zerar: function (senha) {
      if (DEMO) return demo.zerar(senha);
      return apiPost({ acao: "zerar", senha: senha });
    },
    // Arquiva as perguntas no "Histórico de perguntas" e limpa o telão.
    zerarPerguntas: function (senha) {
      if (DEMO) return demo.zerarPerguntas(senha);
      return apiPost({ acao: "zerarPerguntas", senha: senha });
    },
    placar: function () { return DEMO ? demo.placar() : apiGet("placar"); },
    perguntas: function () { return DEMO ? demo.perguntas() : apiGet("perguntas"); },
  };

  /* ---------- utilitários ---------- */
  function escapeHtml(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Monta as expressões de destaque uma única vez.
  // Siglas curtas em maiúsculas (ex.: "IA") só casam exatamente assim,
  // para não destacar "ia" dentro de frases comuns.
  var termos = (CFG.DESTAQUES || []).slice().sort(function (a, b) { return b.length - a.length; });
  var siglas = termos.filter(function (t) { return t.length <= 3 && t === t.toUpperCase(); });
  var palavras = termos.filter(function (t) { return siglas.indexOf(t) === -1; });
  function montarRegex(lista, flags) {
    if (!lista.length) return null;
    try {
      return new RegExp("(^|[^\\p{L}\\p{N}])(" + lista.map(escapeRegex).join("|") + ")(?![\\p{L}\\p{N}])", flags + "u");
    } catch (e) {
      return new RegExp("(^|[^A-Za-zÀ-ÿ0-9])(" + lista.map(escapeRegex).join("|") + ")(?![A-Za-zÀ-ÿ0-9])", flags);
    }
  }
  var reSiglas = montarRegex(siglas, "g");
  var rePalavras = montarRegex(palavras, "gi");

  // Retorna HTML seguro com as palavras-chave envolvidas em <span class="hl">.
  function destacar(texto) {
    var html = escapeHtml(texto);
    var marca = "$1<span class=\"hl\">$2</span>";
    if (rePalavras) html = html.replace(rePalavras, marca);
    if (reSiglas) {
      // Evita mexer no que já está dentro de um destaque.
      html = html.split(/(<span class="hl">.*?<\/span>)/g).map(function (parte) {
        return parte.indexOf("<span") === 0 ? parte : parte.replace(reSiglas, marca);
      }).join("");
    }
    return html;
  }

  // Percentuais de Sim e Não que sempre somam 100% (ou 0% sem votos).
  function percentuais(sim, nao) {
    var total = sim + nao;
    if (!total) return { sim: 0, nao: 0 };
    var ps = Math.round((sim / total) * 100);
    return { sim: ps, nao: 100 - ps };
  }

  function formatarNumero(n) {
    return Number(n || 0).toLocaleString("pt-BR");
  }

  function iniciais(nome) {
    var partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    var a = partes[0].charAt(0);
    var b = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  }

  window.Util = {
    store: store,
    escapeHtml: escapeHtml,
    destacar: destacar,
    percentuais: percentuais,
    formatarNumero: formatarNumero,
    iniciais: iniciais,
  };

  /* ---------- janela "Zerar" dos telões (protegida por senha) ---------- */
  // Usa os elementos #btn-zerar, #modal-zerar, #form-zerar, #campo-senha,
  // #zerar-erro, #btn-cancelar-zerar, #btn-confirmar-zerar e #toast da página.
  //   opcoes.executar(senha) -> Promise da API
  //   opcoes.aoZerar(resposta) -> atualiza a tela e devolve a mensagem do aviso
  function ativarZerar(opcoes) {
    function $(id) { return document.getElementById(id); }
    var modal = $("modal-zerar");
    var campoSenha = $("campo-senha");
    var btnConfirmar = $("btn-confirmar-zerar");
    var erroEl = $("zerar-erro");
    var toastTimer = null;

    function mostrarToast(msg) {
      var t = $("toast");
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.hidden = true; }, 4000);
    }

    function abrir() {
      campoSenha.value = "";
      erroEl.hidden = true;
      if (typeof modal.showModal === "function") modal.showModal();
      else modal.setAttribute("open", "");
      campoSenha.focus();
    }

    function fechar() {
      if (typeof modal.close === "function") modal.close();
      else modal.removeAttribute("open");
    }

    $("btn-zerar").addEventListener("click", abrir);
    $("btn-cancelar-zerar").addEventListener("click", fechar);

    $("form-zerar").addEventListener("submit", function (e) {
      e.preventDefault();
      var senha = campoSenha.value;
      if (!senha && !DEMO) {
        erroEl.textContent = "Digite a senha de administrador.";
        erroEl.hidden = false;
        campoSenha.focus();
        return;
      }

      erroEl.hidden = true;
      btnConfirmar.disabled = true;
      btnConfirmar.classList.add("carregando");

      opcoes.executar(senha)
        .then(function (r) {
          fechar();
          mostrarToast(opcoes.aoZerar(r));
        })
        .catch(function (err) {
          erroEl.textContent = err.definitivo ? err.message : "Não foi possível conectar à planilha. Tente novamente.";
          erroEl.hidden = false;
          campoSenha.select();
        })
        .then(function () {
          btnConfirmar.disabled = false;
          btnConfirmar.classList.remove("carregando");
        });
    });
  }
  window.Util.ativarZerar = ativarZerar;

  /* ---------- aviso de modo demonstração ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    if (!DEMO) return;
    var aviso = document.createElement("div");
    aviso.className = "aviso-demo";
    aviso.textContent = "Modo demonstração (sem planilha conectada)";
    aviso.title = "Configure API_URL em assets/js/config.js";
    document.body.appendChild(aviso);
  });

  /* ---------- botão de tela cheia (telões) ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("btn-tela-cheia");
    if (!btn) return;
    function alternar() {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    btn.addEventListener("click", alternar);
    document.addEventListener("keydown", function (e) {
      if (e.target.matches && e.target.matches("input, textarea")) return;
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) alternar();
    });
    document.addEventListener("fullscreenchange", function () {
      document.body.classList.toggle("tela-cheia", !!document.fullscreenElement);
    });
  });

  /* ---------- fundo animado (rede neural) ---------- */
  function iniciarFundo() {
    var canvas = document.getElementById("fundo-rede");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var reduzir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var pontos = [];
    var w = 0, h = 0, dpr = 1;

    function redimensionar() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var qtd = Math.round(Math.min(90, (w * h) / 16000));
      pontos = [];
      for (var i = 0; i < qtd; i++) {
        pontos.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.6 + 0.4,
        });
      }
    }

    function desenhar() {
      ctx.clearRect(0, 0, w, h);
      var dist = Math.min(150, Math.max(90, w / 10));
      for (var i = 0; i < pontos.length; i++) {
        var p = pontos[i];
        if (!reduzir) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
        for (var j = i + 1; j < pontos.length; j++) {
          var q = pontos[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < dist) {
            ctx.strokeStyle = "rgba(90,140,255," + (0.18 * (1 - d / dist)).toFixed(3) + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        ctx.fillStyle = "rgba(140,200,255,0.75)";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduzir) requestAnimationFrame(desenhar);
    }

    redimensionar();
    window.addEventListener("resize", function () { redimensionar(); if (reduzir) desenhar(); });
    desenhar();
  }
  document.addEventListener("DOMContentLoaded", iniciarFundo);
})();
