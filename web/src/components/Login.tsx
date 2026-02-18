import { useState } from 'react';

interface LoginProps {
  onLogin: () => void;
}

// Simple credentials - in production use proper auth
const VALID_USERNAME = 'jr';
const VALID_PASSWORD = 'runeforge2024';

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      localStorage.setItem('rf-auth', 'true');
      onLogin();
    } else {
      setError('Invalid username or password');
      setPassword('');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '360px',
          padding: '32px',
          background: '#161b22',
          borderRadius: '12px',
          border: '1px solid #30363d',
        }}
      >
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: '24px',
            color: '#e0e0e0',
            textAlign: 'center',
          }}
        >
          Future Tokenizer
        </h1>
        <p
          style={{
            margin: '0 0 24px',
            color: '#666',
            fontSize: '14px',
            textAlign: 'center',
          }}
        >
          Enter password to continue
        </p>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              marginBottom: '16px',
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid #f85149',
              borderRadius: '6px',
              color: '#f85149',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoFocus
          autoComplete="username"
          name="username"
          style={{
            width: '100%',
            padding: '12px 14px',
            marginBottom: '12px',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '6px',
            color: '#e0e0e0',
            fontSize: '16px',
          }}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          name="password"
          style={{
            width: '100%',
            padding: '12px 14px',
            marginBottom: '16px',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '6px',
            color: '#e0e0e0',
            fontSize: '16px',
          }}
        />

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '12px',
            background: '#238636',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
