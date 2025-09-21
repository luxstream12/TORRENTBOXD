const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const fs = require('fs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());

// Carrega catálogo de filmes
let filmes = JSON.parse(fs.readFileSync("database.json", "utf8"));

// Pedidos temporários
let pedidos = {};

// Listar filmes disponíveis
bot.onText(/\/filmes/, (msg) => {
  const chatId = msg.chat.id;

  let lista = filmes.map(f => `🎬 *${f.id}* - ${f.titulo} (R$ ${f.preco})`).join("\n");
  bot.sendMessage(chatId, `📽️ Filmes disponíveis:\n\n${lista}\n\nDigite /comprar ID_DO_FILME`, { parse_mode: "Markdown" });
});

// Comprar filme por ID
bot.onText(/\/comprar (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const id = parseInt(match[1]);

  const filme = filmes.find(f => f.id === id);
  if (!filme) {
    return bot.sendMessage(chatId, "❌ Filme não encontrado. Use /filmes para ver a lista.");
  }

  try {
    // Criar cobrança no Pushin Pay
    const response = await axios.post("https://api.pushinpay.com/v1/pix", {
      amount: filme.preco,
      description: `Compra do filme: ${filme.titulo}`
    }, {
      headers: { Authorization: `Bearer ${process.env.PUSHIN_TOKEN}` }
    });

    const { qrCode, txid } = response.data;

    // Salva pedido
    pedidos[txid] = { chatId, filme };

    // Envia QR Code
    bot.sendMessage(chatId, `💰 Para pagar *${filme.titulo}* (R$ ${filme.preco}), use o QR Code abaixo:`, { parse_mode: "Markdown" });
    bot.sendPhoto(chatId, qrCode);

  } catch (error) {
    console.error(error.response?.data || error);
    bot.sendMessage(chatId, "❌ Erro ao gerar pagamento. Tente novamente mais tarde.");
  }
});

// Webhook do Pushin Pay
app.post("/webhook/pushin", (req, res) => {
  const { txid, status } = req.body;

  if (status === "paid" && pedidos[txid]) {
    const { chatId, filme } = pedidos[txid];
    bot.sendMessage(chatId, `✅ Pagamento confirmado!\n\n🎬 Aqui está seu filme: ${filme.link}`);
    delete pedidos[txid];
  }

  res.sendStatus(200);
});

// Servidor Express (Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
