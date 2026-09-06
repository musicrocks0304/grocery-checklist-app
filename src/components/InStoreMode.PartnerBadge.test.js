import React from 'react';
import { render, screen } from '@testing-library/react';
import { PartnerBadge } from './InStoreMode';

// PartnerBadge.js ~998: role="host" reads "Invite link active" (the host
// can't yet tell whether anyone has joined), any other role reads "Shopping
// with partner". Neither string contains the word "host"/"partner" so the
// assertions match the literal label copy, not a loose /host|partner/ regex.
test('labels host and partner roles', () => {
  const { rerender } = render(<PartnerBadge role="host" expiresAt="2099-01-01T00:00:00Z" />);
  expect(screen.getByText('Invite link active')).toBeInTheDocument();
  rerender(<PartnerBadge role="partner" expiresAt="2099-01-01T00:00:00Z" />);
  expect(screen.getByText('Shopping with partner')).toBeInTheDocument();
});

test('shows an hours-left figure derived from expiresAt', () => {
  render(<PartnerBadge role="host" expiresAt="2099-01-01T00:00:00Z" />);
  expect(screen.getByText(/·\s*\d+h left/)).toBeInTheDocument();
});

test('omits the hours-left figure once expired or when expiresAt is absent', () => {
  const { rerender } = render(<PartnerBadge role="host" expiresAt="2000-01-01T00:00:00Z" />);
  expect(screen.queryByText(/h left/)).not.toBeInTheDocument();
  rerender(<PartnerBadge role="host" expiresAt={null} />);
  expect(screen.queryByText(/h left/)).not.toBeInTheDocument();
});
