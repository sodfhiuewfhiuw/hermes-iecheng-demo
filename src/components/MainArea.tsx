import React from 'react';
import { useAppContext } from '../store/AppContext';
import { HermesRoomView } from '../views/HermesRoomView';
import { PersonaView } from '../views/PersonaView';
import { ScriptLibraryView } from '../views/ScriptLibraryView';
import { ScriptWorkbenchView } from '../views/ScriptWorkbenchView';
import { UrlLearningView } from '../views/UrlLearningView';

export const MainArea: React.FC = () => {
  const { activeView } = useAppContext();

  const renderView = () => {
    switch (activeView) {
      case 'persona':
        return <PersonaView />;
      case 'learn-url':
        return <UrlLearningView />;
      case 'room':
        return <HermesRoomView />;
      case 'workbench':
        return <ScriptWorkbenchView />;
      case 'library':
        return <ScriptLibraryView />;
      default:
        return <HermesRoomView />;
    }
  };

  return <main className="main-area">{renderView()}</main>;
};
