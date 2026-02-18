interface TutorialHintProps {
  message: string;
  position: 'center' | 'left';
  onSkip: () => void;
}

export default function TutorialHint({ message, position, onSkip }: TutorialHintProps) {
  const isCenter = position === 'center';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isCenter ? '30%' : '40%',
        left: isCenter ? '50%' : '200px',
        transform: isCenter ? 'translateX(-50%)' : 'none',
        zIndex: 1000,
        background: '#161b22',
        borderLeft: '3px solid #58a6ff',
        borderRadius: '8px',
        padding: '12px 16px',
        color: '#e6edf3',
        fontSize: '14px',
        maxWidth: '280px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div style={{ marginBottom: '8px' }}>{message}</div>
      <button
        onClick={onSkip}
        style={{
          background: 'none',
          border: 'none',
          color: '#8b949e',
          fontSize: '12px',
          cursor: 'pointer',
          padding: 0,
          textDecoration: 'underline',
        }}
      >
        skip tutorial
      </button>
    </div>
  );
}
