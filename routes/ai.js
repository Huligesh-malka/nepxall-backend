const express = require("express");
const router = express.Router();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

router.post("/chat", async (req, res) => {

  try {

    const userMessage = req.body.message;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const result = await model.generateContent(userMessage);

    const response = result.response.text();

    res.json({
      success: true,
      reply: response
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "AI Error"
    });

  }

});

module.exports = router;