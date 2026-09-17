const { OpenAI } = require("openai");

let client = null;

function getOpenAI() {
  if (!process.env.API_GPT_4) {
    throw new Error("Thiếu API_GPT trong biến môi trường");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.API_GPT_4 });
  }
  return client;
}

function getChatModel() {
  return process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna";
}

function getEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
}

module.exports = {
  getOpenAI,
  getChatModel,
  getEmbeddingModel,
};
