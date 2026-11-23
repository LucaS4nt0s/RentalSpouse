'use client';

import React from 'react';
import { AppHeader } from '../layout/AppHeader';

interface AdminNavigationHeaderProps {
  currentAdmin?: {
    name?: string;
    email?: string;
  } | null;
  onLogout?: () => void;
}

export const AdminNavigationHeader: React.FC<AdminNavigationHeaderProps> = ({
  onLogout,
}) => {
  return <AppHeader onCustomLogout={onLogout} />;
};
