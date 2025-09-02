// pages/HelpPage.tsx
import React from 'react';
import HelpCenter from '../components/help/HelpCenter';

const HelpPage: React.FC = () => {
  const [open, setOpen] = React.useState(true);
  return <HelpCenter open={open} onClose={() => setOpen(false)} />;
};

export default HelpPage;
