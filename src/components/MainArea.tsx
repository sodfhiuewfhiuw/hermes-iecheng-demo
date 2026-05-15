import React from 'react';
import { useAppContext } from '../store/AppContext';
import { PersonaView } from '../views/PersonaView';
import { UrlLearningView } from '../views/UrlLearningView';
import { ScriptWorkbenchView } from '../views/ScriptWorkbenchView';
import { ScriptLibraryView } from '../views/ScriptLibraryView';

export const MainArea: React.FC = () => {
  const { activeView } = useAppContext();

  const renderView = () => {
    switch (activeView) {
      case 'persona':
        return <PersonaView />;
      case 'learn-url':
        return <UrlLearningView />;
      case 'workbench':
        return <ScriptWorkbenchView />;
      case 'library':
        return <ScriptLibraryView />;
      default:
        return <div>View not found</div>;
    }
  };

  return (
    <main className="main-area">
      {renderView()}
    </main>
  );
};
