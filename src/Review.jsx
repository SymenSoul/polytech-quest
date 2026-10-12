import React from 'react';
import { BookOpen, Check, X } from 'lucide-react';
import { MODULE_LABELS } from '../shared/quest.js';
import { reviewFor, storyFor } from './questContent.js';

// Разбор заданий: доступен только после финиша или окончания времени, чтобы не подсказывать во время игры.
export function Review({ player }) {
  if (player.status === 'playing') return null;

  return (
    <section className="review" aria-label="Разбор заданий">
      <div className="panel-title">
        <BookOpen size={16} />
        Разбор заданий
      </div>
      {player.modules.map((id, index) => {
        const solved = player.solved.includes(id);
        const review = reviewFor(id, player.level);
        return (
          <article key={id} className={`review-item ${solved ? 'solved' : ''}`}>
            <header>
              <span className="review-index">{index + 1}</span>
              <div>
                <strong>{storyFor(id, player.level).title}</strong>
                <span>
                  {MODULE_LABELS[id]} · {solved ? 'решено' : 'не решено'} · ошибок: {player.mistakes[id] ?? 0} ·
                  подсказок: {player.hints[id] ?? 0}
                </span>
              </div>
              {solved ? <Check size={18} /> : <X size={18} />}
            </header>
            <p className="review-answer">
              <b>Ответ:</b> {review.answer}
            </p>
            <p>{review.explanation}</p>
          </article>
        );
      })}
    </section>
  );
}
