import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TutorialHint from '../components/TutorialHint';

describe('TutorialHint', () => {
  it('renders the message text', () => {
    render(<TutorialHint message="Click this node" position="center" onSkip={() => {}} />);
    expect(screen.getByText('Click this node')).toBeInTheDocument();
  });

  it('renders skip link that calls onSkip', () => {
    const onSkip = vi.fn();
    render(<TutorialHint message="Pick a skill" position="left" onSkip={onSkip} />);
    const skipLink = screen.getByText('skip tutorial');
    fireEvent.click(skipLink);
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('positions center hint with centered styles', () => {
    const { container } = render(
      <TutorialHint message="Hello" position="center" onSkip={() => {}} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.left).toBe('50%');
    expect(el.style.transform).toContain('translateX(-50%)');
  });

  it('positions left hint near sidebar', () => {
    const { container } = render(
      <TutorialHint message="Hello" position="left" onSkip={() => {}} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.left).toBe('200px');
  });
});
