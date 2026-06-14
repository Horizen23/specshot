import { useState, useEffect } from "react";

const ENDPOINTS = {
  real: "http://localhost:3000",
  fake: "http://localhost:3457",
};

export default function App() {
  const [apiUrl, setApiUrl] = useState(ENDPOINTS.real);
  const [memes, setMemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMemes = async (url) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${url}/memes`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setMemes(data);
    } catch (err) {
      setError(err.message);
      setMemes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemes(apiUrl);
  }, [apiUrl]);

  const toggleEndpoint = (mode) => {
    if (mode === "real") {
      setApiUrl(ENDPOINTS.real);
    } else {
      setApiUrl(ENDPOINTS.fake);
    }
  };

  const isReal = apiUrl === ENDPOINTS.real;

  return (
    <div className="app">
      <div className="endpoint-toggle">
        <button
          className={`ep-btn ${isReal ? "active" : ""}`}
          onClick={() => toggleEndpoint("real")}
        >
          Real API (3000)
        </button>
        <button
          className={`ep-btn ${!isReal ? "active" : ""}`}
          onClick={() => toggleEndpoint("fake")}
        >
          Fake API (3457)
        </button>
      </div>

      <div className="api-bar">
        Connected to: <span className={isReal ? "real" : "fake"}>{apiUrl}</span>
      </div>

      {loading && <p className="status">Loading...</p>}
      {error && <p className="status error">{error}</p>}

      <div className="meme-list">
        {memes.map((meme) => (
          <MemeCard key={meme.id} meme={meme} apiUrl={apiUrl} />
        ))}
      </div>
    </div>
  );
}

function MemeCard({ meme, apiUrl }) {
  const [voted, setVoted] = useState(null);

  const handleVote = async (guess) => {
    if (voted) return;
    try {
      const res = await fetch(`${apiUrl}/memes/${meme.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess }),
      });
      const data = await res.json();
      setVoted(data);
    } catch {
      // ignore
    }
  };

  return (
    <div className="card">
      <img src={meme.imageUrl} alt={meme.caption} />
      <p className="caption">{meme.caption}</p>
      <span className="category">{meme.category}</span>

      {!voted ? (
        <div className="actions">
          <button className="btn btn-real" onClick={() => handleVote("real")}>
            Real
          </button>
          <button className="btn btn-fake" onClick={() => handleVote("fake")}>
            Fake
          </button>
        </div>
      ) : (
        <div className="result">
          <span className={voted.correct ? "green" : "red"}>
            {voted.correct ? "Correct" : "Wrong"} — it's {voted.isReal ? "REAL" : "FAKE"}
          </span>
          <span className="vote-stats">
            R: {voted.realVotes} / F: {voted.fakeVotes}
          </span>
        </div>
      )}
    </div>
  );
}
