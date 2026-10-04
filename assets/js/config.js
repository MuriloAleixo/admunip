/* =====================================================================
   CONFIGURAÇÃO DO EVENTO
   ---------------------------------------------------------------------
   Este é o ÚNICO arquivo que você precisa editar depois de publicar o
   Google Apps Script (veja INSTRUCOES_GOOGLE.md).
   ===================================================================== */
window.EVENTO_CONFIG = {
  // URL do "App da Web" gerada na implantação do Google Apps Script.
  // Ela termina em /exec. Exemplo:
  // "https://script.google.com/macros/s/AKfycbx.../exec"
  //
  // Enquanto estiver vazia, o site roda em MODO DEMONSTRAÇÃO: os votos e
  // perguntas ficam salvos só no navegador (bom para testar o layout).
  API_URL: "https://script.google.com/macros/s/AKfycbydxqY_lEzBNF1l6RvXFqYMSJ8pplZETqPpIEQdXIcuDnvI1SWTbGjjYqRJhA6nQVeltg/exec",

  // Pergunta da enquete (mostrada no celular e no telão).
  PERGUNTA_VOTACAO:
    "A Inteligência Artificial pode ampliar oportunidades na educação e no trabalho?",

  // Palavras destacadas em ciano nas perguntas e na enquete.
  DESTAQUES: [
    "Inteligência Artificial",
    "IA",
    "educação",
    "trabalho",
    "inovação",
    "aprendizagem",
    "tecnologia",
    "futuro",
  ],

  // De quanto em quanto tempo o telão busca dados novos (milissegundos).
  INTERVALO_PLACAR_MS: 3000,
  // Placar no celular de quem já votou (também detecta quando a votação
  // é zerada). Não use menos de 5000: são muitos celulares ao mesmo tempo.
  INTERVALO_PLACAR_CELULAR_MS: 8000,
  INTERVALO_PERGUNTAS_MS: 5000,
};
