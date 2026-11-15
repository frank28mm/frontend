import { useCallback, useEffect, useState } from 'react';

import {
  getCapabilities,
  getFallbackCapabilitiesSnapshot,
  subjectReadEnabledFromSnapshot,
  subjectSubmissionEnabledFromSnapshot,
  type CapabilitiesSnapshot,
} from '@/services/capabilities';
import type { CapabilitySubject } from '@/services/types';

export const useSubjectCapabilities = () => {
  const [snapshot, setSnapshot] = useState<CapabilitiesSnapshot>(() =>
    getFallbackCapabilitiesSnapshot(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCapabilities().then((nextSnapshot) => {
      if (!active) return;
      setSnapshot(nextSnapshot);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const isReadEnabled = useCallback(
    (subject: CapabilitySubject) => subjectReadEnabledFromSnapshot(snapshot, subject),
    [snapshot],
  );
  const isSubmissionEnabled = useCallback(
    (subject: CapabilitySubject) => subjectSubmissionEnabledFromSnapshot(snapshot, subject),
    [snapshot],
  );

  return {
    snapshot,
    loading,
    isReadEnabled,
    isSubmissionEnabled,
  };
};
