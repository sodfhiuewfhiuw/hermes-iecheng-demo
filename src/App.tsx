import React from 'react';
import { AppProvider, useAppContext } from './store/AppContext';
import { Sidebar } from './components/Sidebar';
import { ContextPanel } from './components/ContextPanel';
import { MainArea } from './components/MainArea';

const AppContent: React.FC = () => {
  const { isLoading } = useAppContext();

  if (isLoading) {
    return <div className="loading-screen">載入 IE程 Demo...</div>;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <MainArea />
      <ContextPanel />
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
