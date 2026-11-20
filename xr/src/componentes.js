import { createComponent, Types } from '@iwsdk/core';

// Marca los objetos que responden al rayo, al toque o al agarre; la narrativa decide qué hace cada id.
export const Tocable = createComponent('Tocable', {
  id: { type: Types.String, default: '' }
});
