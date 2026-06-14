import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const memes = [
  {
    id: "1",
    imageUrl: "https://picsum.photos/seed/ff1/600/400",
    caption: "FAKE: Dogs can only see in black and white",
    category: "science",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "2",
    imageUrl: "https://picsum.photos/seed/ff2/600/400",
    caption: "FAKE: Humans only use 10% of their brain",
    category: "science",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "3",
    imageUrl: "https://picsum.photos/seed/ff3/600/400",
    caption: "FAKE: Bats are completely blind",
    category: "science",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
  {
    id: "4",
    imageUrl: "https://picsum.photos/seed/ff4/600/400",
    caption: "FAKE: Goldfish have a 3-second memory",
    category: "science",
    isReal: false,
    totalVotes: 0,
    realVotes: 0,
    fakeVotes: 0,
  },
];

app.get("/memes", (_req, res) => res.json(memes));

app.get("/memes/:memeId", (req, res) => {
  const meme = memes.find((m) => m.id === req.params.memeId);
  if (!meme) return res.status(404).json({ error: "Not found" });
  res.json(meme);
});

app.post("/memes/:memeId/vote", (req, res) => {
  const meme = memes.find((m) => m.id === req.params.memeId);
  if (!meme) return res.status(404).json({ error: "Not found" });

  const { guess } = req.body;
  const correct = (guess === "real") === meme.isReal;

  meme.totalVotes++;
  if (guess === "real") meme.realVotes++;
  else meme.fakeVotes++;

  res.json({
    correct,
    isReal: meme.isReal,
    totalVotes: meme.totalVotes,
    realVotes: meme.realVotes,
    fakeVotes: meme.fakeVotes,
  });
});

app.listen(3457, () => {
  console.log("Fake server running on http://localhost:3457");
});
