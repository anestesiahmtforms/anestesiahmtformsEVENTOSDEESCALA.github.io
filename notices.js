window.SAHMT_NOTICES = {
  // Informe o id do aviso que deve abrir no aplicativo. Use null para ocultar todos os avisos.
  // Use aspas duplas no titulo e crases (`) nas mensagens para permitir varias linhas.
  activeId: "aviso-principal",
  notices: [
    {
      id: "aviso-principal",
      eyebrow: "Comunicado SAHMT",
      title: "💉 IDENTIFIQUE TODAS AS SERINGAS!",
      message: `🚫 Nunca utilize uma seringa sem identificação.`,
      accent: "gold"
    },
    {
      id: "aviso-reserva-1",
      eyebrow: "Aviso de reserva",
      title: "Comunicado da equipe",
      message: `Escreva aqui uma mensagem de reserva para ativar quando necessario.`,
      accent: "blue"
    },
    {
      id: "aviso-reserva-2",
      eyebrow: "Atualizacao SAHMT",
      title: "Novo aviso",
      message: `Este e um segundo aviso de reserva disponivel para uso futuro.`,
      accent: "green"
    }
  ]
};
