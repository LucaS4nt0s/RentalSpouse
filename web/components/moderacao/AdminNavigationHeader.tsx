'use client';

import React from 'react';
import { AppHeader } from '../layout/AppHeader';

interface AdminNavigationHeaderProps {
  currentAdmin?: {
    name?: string;
    email?: string;
  } | null;
  onLogout?: () => void;
  pendingDenunciasCount?: number;
}

export const AdminNavigationHeader: React.FC<AdminNavigationHeaderProps> = ({
  onLogout,
  pendingDenunciasCount,
}) => {
  return (
    <AppHeader
      onCustomLogout={onLogout}
      pendingDenunciasCount={pendingDenunciasCount}
    />
  );
};
