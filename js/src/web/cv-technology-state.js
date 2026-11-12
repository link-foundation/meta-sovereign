import { useEffect, useRef, useState } from 'react';

export const useCvTechnologyReview = ({ api, values, run, technology }) => {
  const [review, setReview] = useState(null);
  const [choices, setChoices] = useState({ ru: '', en: '' });
  const [selected, setSelected] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  const browserSlot = values.browserSlot;
  const load = async (current) => {
    const answer = await api.vacancyCvTechnologyReviewStored({ browserSlot });
    if (current === generation.current) {
      setReview(answer.review);
      setSelected(answer.review?.selected ?? []);
      setLoadError(false);
    }
    return answer;
  };
  useEffect(() => {
    const current = ++generation.current;
    setReview(null);
    setChoices({ ru: '', en: '' });
    setSelected([]);
    setLoadError(false);
    void load(current).catch(() => {
      if (current === generation.current) {
        setLoadError(true);
      }
    });
    return () => {
      generation.current++;
    };
  }, [api, browserSlot]);
  const accept = (answer, current) => {
    if (current === generation.current) {
      setReview(answer.review);
      setSelected(answer.review?.selected ?? []);
      setLoadError(false);
    }
    return answer;
  };
  return {
    review,
    choices,
    selected,
    loadError,
    choose: (language, value) =>
      setChoices((old) => ({ ...old, [language]: value })),
    select: (id, checked) =>
      setSelected((old) =>
        checked
          ? [...new Set([...old, id])]
          : old.filter((value) => value !== id)
      ),
    generate: (exports) =>
      run('technology-review', async () => {
        const current = generation.current;
        const chosen = ['ru', 'en'].map((language) =>
          exports.find(
            (item) =>
              item.language === language &&
              `${item.exportId}:${item.hash}` === choices[language] &&
              item.browserSlot === browserSlot
          )
        );
        if (chosen.some((item) => !item) || technology.dirty) {
          throw new Error('jobs-technology-resume');
        }
        return accept(
          await api.vacancyCvTechnologyReview({
            browserSlot,
            revision: technology.catalog.revision,
            exports: chosen.map((item) => ({
              exportId: item.exportId,
              hash: item.hash,
            })),
          }),
          current
        );
      }),
    save: () =>
      run('technology-review-save', async () => {
        const current = generation.current;
        return accept(
          await api.vacancyCvTechnologyReviewSave({
            browserSlot,
            fingerprint: review.fingerprint,
            selected,
          }),
          current
        );
      }),
    reload: () =>
      run('technology-review-reload', () => load(++generation.current)),
  };
};
