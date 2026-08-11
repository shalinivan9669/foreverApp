export type HelpCatalogAction = {
  href: `/profile${string}`;
  label: string;
};

export type HelpCatalogSection = {
  id: string;
  title: string;
  body: string;
  points: readonly [string, ...string[]];
  action?: HelpCatalogAction;
};

export type HelpResourceCatalog = {
  catalogVersion: string;
  locale: 'ru';
  emergencyNotice: {
    id: string;
    title: string;
    body: string;
  };
  sections: readonly HelpCatalogSection[];
};

export const HELP_RESOURCE_CATALOG: HelpResourceCatalog = {
  catalogVersion: 'help-ru-v1',
  locale: 'ru',
  emergencyNotice: {
    id: 'immediate-danger',
    title: 'Ограничения в кризисной ситуации',
    body: 'Forever не является экстренной службой, кризисным центром или медицинским сервисом. Приложение не распознаёт опасность автоматически и не связывается за вас с партнёром, близкими или службами помощи. Если есть непосредственная угроза жизни или безопасности, обратитесь в местную экстренную службу или к человеку, которому доверяете.',
  },
  sections: [
    {
      id: 'weekly-cycle',
      title: 'Еженедельный цикл',
      body: 'Короткая сверка помогает паре увидеть общий ритм без раскрытия личных ответов.',
      points: [
        'Каждый отвечает отдельно; общая сводка готова только после ответов обоих.',
        'Партнёр не видит точные значения и личную заметку из вашей формы.',
        'Если цикл пропущен, система не подставляет ответы за вас.',
      ],
    },
    {
      id: 'privacy-boundaries',
      title: 'Границы приватности',
      body: 'По умолчанию личные данные остаются у их владельца.',
      points: [
        'Личный дневник, приватные заметки и настройки SafetyGate не показываются партнёру.',
        'Парная часть получает безопасные общие сигналы, а не чужие сырые ответы.',
        'Свои данные можно скачать в настройках аккаунта.',
      ],
      action: { href: '/profile/settings', label: 'Открыть настройки данных' },
    },
    {
      id: 'partner-signals',
      title: 'Сигналы партнёру',
      body: 'Сигнал — это отдельная фраза, которую вы решаете отправить сами.',
      points: [
        'Черновик остаётся личным, пока вы явно не подтвердите отправку.',
        'Партнёру передаётся выбранный текст, а не дневник или подробности состояния.',
        'Forever не читает личные переписки за пределами приложения.',
      ],
    },
    {
      id: 'pair-lifecycle',
      title: 'Пауза, завершение и новое подключение',
      body: 'Это разные действия с разными последствиями.',
      points: [
        'Пауза временно останавливает новые совместные действия; пару можно возобновить.',
        'Завершение закрывает текущую пару и не равно удалению аккаунта.',
        'После завершения новое подключение начинается через новое взаимное приглашение.',
      ],
    },
    {
      id: 'safety-gate',
      title: 'SafetyGate',
      body: 'Приватная настройка оставляет только нейтральные активности с низкой нагрузкой.',
      points: [
        'Партнёр не получает причину включения и не видит ваш выбор.',
        'Настройка не меняет общую сводку или результат пары.',
        'SafetyGate можно включить или выключить в любой момент, пока пара доступна.',
      ],
      action: { href: '/profile/safety', label: 'Открыть SafetyGate' },
    },
  ],
};

export const validateHelpCatalog = (
  catalog: HelpResourceCatalog = HELP_RESOURCE_CATALOG
): string[] => {
  const errors: string[] = [];
  if (!/^help-[a-z]{2}-v\d+$/.test(catalog.catalogVersion)) {
    errors.push('catalogVersion must follow help-<locale>-v<number>');
  }

  const ids = [catalog.emergencyNotice.id, ...catalog.sections.map((section) => section.id)];
  if (new Set(ids).size !== ids.length) errors.push('catalog ids must be unique');

  for (const section of catalog.sections) {
    if (!section.id.trim() || !section.title.trim() || !section.body.trim()) {
      errors.push(`section ${section.id || '<empty>'} has empty required copy`);
    }
    if (section.points.length === 0 || section.points.some((point) => !point.trim())) {
      errors.push(`section ${section.id || '<empty>'} must have non-empty points`);
    }
  }

  return errors;
};

const catalogErrors = validateHelpCatalog();
if (catalogErrors.length > 0) {
  throw new Error(`Invalid help resource catalog: ${catalogErrors.join('; ')}`);
}
