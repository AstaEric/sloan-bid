import React from 'react';

interface Props {
  rating: number;
  size?: 'sm' | 'md';
}

export function StarRating({ rating, size = 'md' }: Props) {
  const full = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.4;
  const empty = 5 - full - (hasHalf ? 1 : 0);
  const cls = size === 'sm' ? 'star-sm' : 'star-md';

  return (
    <span className={`star-rating ${cls}`}>
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`} className="star star-full">★</span>
      ))}
      {hasHalf && <span className="star star-half">★</span>}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="star star-empty">★</span>
      ))}
      <span className="star-value">({rating})</span>
    </span>
  );
}
