import { useEffect } from 'react';
import { ensureCandidateAlertNotificationSetup, scanFavoriteCandidateAlerts } from '../services/candidateAlerts';

export function useCandidateAlertMonitor() {
  useEffect(() => {
    void ensureCandidateAlertNotificationSetup();
    void scanFavoriteCandidateAlerts();
  }, []);
}
