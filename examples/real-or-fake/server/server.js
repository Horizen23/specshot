import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

let score = 0;

const memes = [
  {
    id: "1",
    imageUrl: "https://picsum.photos/seed/meme1/600/400",
    caption: "NASA confirms Earth is actually flat",
    category: "science",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "2",
    imageUrl: "https://picsum.photos/seed/meme2/600/400",
    caption: "Octopuses have three hearts and blue blood",
    category: "science",
    isReal: true,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "3",
    imageUrl: "https://picsum.photos/seed/meme3/600/400",
    caption: "The Great Wall of China is visible from space with the naked eye",
    category: "history",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "4",
    imageUrl: "https://picsum.photos/seed/meme4/600/400",
    caption: "Bananas are berries but strawberries are not",
    category: "science",
    isReal: true,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "5",
    imageUrl: "https://picsum.photos/seed/meme5/600/400",
    caption: "Albert Einstein failed math in school",
    category: "history",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "6",
    imageUrl: "https://picsum.photos/seed/meme6/600/400",
    caption: "A day on Venus is longer than a year on Venus",
    category: "science",
    isReal: true,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "7",
    imageUrl: "https://picsum.photos/seed/meme7/600/400",
    caption: "Sharks existed before trees",
    category: "science",
    isReal: true,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "8",
    imageUrl: "https://picsum.photos/seed/meme8/600/400",
    caption: "Vikings wore horned helmets into battle",
    category: "history",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
];

const leaderboard = [
  { rank: 1, username: "MemeLord420", score: 42, totalVotes: 50, accuracy: 0.84 },
  { rank: 2, username: "FactChecker99", score: 38, totalVotes: 45, accuracy: 0.84 },
  { rank: 3, username: "RealOrNah", score: 35, totalVotes: 40, accuracy: 0.875 },
  { rank: 4, username: "CaptainTruth", score: 30, totalVotes: 38, accuracy: 0.79 },
  { rank: 5, username: "SkepticalSam", score: 28, totalVotes: 35, accuracy: 0.8 },
];

app.get("/memes", (req, res) => {
  const { limit, category } = req.query;
  let result = [...memes];

  if (category) {
    result = result.filter((m) => m.category === category);
  }
  if (limit) {
    result = result.slice(0, parseInt(limit));
  }
  res.json(result);
});

app.post("/memes", (req, res) => {
  const { imageUrl, caption, category, isReal } = req.body;
  const meme = {
    id: String(memes.length + 1),
    imageUrl,
    caption: caption || "",
    category: category || "pop-culture",
    isReal,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  };
  memes.push(meme);
  res.status(201).json(meme);
});

app.get("/memes/:memeId", (req, res) => {
  const meme = memes.find((m) => m.id === req.params.memeId);
  if (!meme) return res.status(404).json({ error: "Meme not found" });
  res.json(meme);
});

app.post("/memes/:memeId/vote", (req, res) => {
  const meme = memes.find((m) => m.id === req.params.memeId);
  if (!meme) return res.status(404).json({ error: "Meme not found" });

  const { guess } = req.body;
  const isRealGuess = guess === "real";
  const correct = isRealGuess === meme.isReal;

  meme.totalVotes++;
  if (isRealGuess) {
    meme.realVotes++;
  } else {
    meme.fakeVotes++;
  }

  if (correct) score += 10;
  else score = Math.max(0, score - 5);

  res.json({
    correct,
    isReal: meme.isReal,
    score,
    totalVotes: meme.totalVotes,
    realVotes: meme.realVotes,
    fakeVotes: meme.fakeVotes,
  });
});

app.get("/leaderboard", (_req, res) => {
  res.json(leaderboard);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
