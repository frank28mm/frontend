import { PRODUCT_IDENTITY } from '@/content/productIdentity';
export type LocalizedText = {
  zh: string;
  en: string;
};

export type PrivacySection = {
  title: LocalizedText;
  paragraphs: LocalizedText[];
};

export const PRIVACY_LAST_UPDATED = '2026-10-11';

export const PRIVACY_SUMMARY: LocalizedText = {
  zh: `本隐私政策适用于 ${PRODUCT_IDENTITY.name}。我们仅在提供学习辅助服务所必需范围内处理个人信息，并采取访问控制、传输加密、最小权限等措施保护数据安全。`,
  en: `This Privacy Policy applies to ${PRODUCT_IDENTITY.nameEn}. We process personal data only as necessary to provide learning-assistance services and protect it with access control, encrypted transport, and least-privilege measures.`,
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: {
      zh: '1. 适用范围',
      en: '1. Scope',
    },
    paragraphs: [
      {
        zh: `本政策适用于你使用 ${PRODUCT_IDENTITY.name}相关服务时的个人信息处理活动，包括上传作业、批改、错题归档、数据中心、分析报告、AI 辅导、账号管理等。`,
        en: `This policy applies when you use ${PRODUCT_IDENTITY.nameEn} services, including upload, grading, mistake archiving, data center, analytics reports, AI tutoring, and account management.`,
      },
      {
        zh: '本政策不适用于第三方独立提供的服务；你访问第三方服务时，适用其自身规则。',
        en: 'This policy does not cover services independently provided by third parties; their own terms apply when you use their services.',
      },
    ],
  },
  {
    title: {
      zh: '2. 我们处理的信息类型',
      en: '2. Data We Process',
    },
    paragraphs: [
      {
        zh: '账号与身份信息：手机号、登录凭证、验证码校验信息、家长昵称、孩子档案展示信息（如显示名称、头像）。',
        en: 'Account and identity information: phone number, login credentials, verification data, parent nickname, and child-profile display data.',
      },
      {
        zh: '学习业务数据：作业图片、OCR 识别文本、题目切片、批改结果、错因标签、知识点标签、报告数据、AI 辅导对话内容。',
        en: 'Learning data: homework images, OCR text, question slices, grading outputs, error-cause tags, knowledge tags, report data, and tutoring conversations.',
      },
      {
        zh: '运行与安全数据：设备类型、系统版本、网络信息、必要的请求日志、错误日志及会话标识（如 request_id / session_id）。',
        en: 'Operational and security data: device type, OS version, network information, request logs, error logs, and identifiers such as request_id/session_id.',
      },
      {
        zh: '你主动提交的信息：反馈、申诉、客服沟通内容等。',
        en: 'Information you provide actively: feedback, complaints, and support communication content.',
      },
    ],
  },
  {
    title: {
      zh: '3. 我们如何使用信息',
      en: '3. How We Use Data',
    },
    paragraphs: [
      {
        zh: '用于实现作业识别、批改、错题归档、报告生成、AI 辅导等核心功能。',
        en: 'To provide core features such as grading, mistake archiving, report generation, and AI tutoring.',
      },
      {
        zh: '用于保障服务稳定与安全，包括故障排查、性能优化、风控审计、反滥用。',
        en: 'To ensure service reliability and security, including troubleshooting, performance optimization, risk control, and anti-abuse.',
      },
      {
        zh: '用于账号与权益管理，包括登录鉴权、配额核验、订阅/报告券记录处理。',
        en: 'To manage account and entitlement functions, including login verification, quota checks, and subscription/coupon records.',
      },
      {
        zh: '在符合法律法规前提下，基于去标识化或聚合数据进行统计分析和产品改进。',
        en: 'Where permitted by law, to improve products based on de-identified or aggregated statistics.',
      },
    ],
  },
  {
    title: {
      zh: '4. 处理依据与同意',
      en: '4. Legal Bases and Consent',
    },
    paragraphs: [
      {
        zh: '我们基于履行服务合同、履行法定义务、你作出的授权同意及其他法律法规允许的情形处理个人信息。',
        en: 'We process personal data based on contract performance, legal obligations, your consent, and other lawful grounds.',
      },
      {
        zh: '你可在法律允许范围内撤回同意；撤回前基于同意开展的处理不受影响。',
        en: 'You may withdraw consent where permitted by law; processing before withdrawal remains lawful.',
      },
    ],
  },
  {
    title: {
      zh: '5. Cookie、LocalStorage 与同类技术',
      en: '5. Cookie, LocalStorage, and Similar Technologies',
    },
    paragraphs: [
      {
        zh: '我们使用必要的 Cookie/LocalStorage 及同类技术，用于维持登录状态、会话连续性、页面偏好与流程进度。',
        en: 'We use necessary Cookie/LocalStorage technologies to maintain login state, session continuity, page preferences, and process progress.',
      },
      {
        zh: '你可通过浏览器设置清理相关数据，但这可能影响部分功能可用性。',
        en: 'You may clear these local data via browser settings, which may affect feature availability.',
      },
    ],
  },
  {
    title: {
      zh: '6. 信息共享、委托处理与披露',
      en: '6. Sharing, Processing by Entrustment, and Disclosure',
    },
    paragraphs: [
      {
        zh: '我们可能在必要范围内委托第三方服务商提供云存储、模型推理、基础设施与安全能力，并要求其履行保密和安全义务。',
        en: 'We may entrust third-party providers for cloud storage, model inference, infrastructure, and security within necessary scope, under confidentiality and security obligations.',
      },
      {
        zh: '除法律法规要求、你明确授权或为保护重大合法权益外，我们不会向无关第三方披露你的个人信息，也不会出售个人信息。',
        en: 'Except where required by law, explicitly authorized by you, or needed to protect major lawful interests, we do not disclose to unrelated third parties and do not sell personal data.',
      },
    ],
  },
  {
    title: {
      zh: '7. 存储期限与安全措施',
      en: '7. Retention and Security',
    },
    paragraphs: [
      {
        zh: '我们采用访问控制、传输加密、最小权限、日志审计等措施，持续提升信息安全能力。',
        en: 'We apply access control, encrypted transport, least-privilege, and audit logging to protect data security.',
      },
      {
        zh: '我们仅在实现处理目的所必需期限内保存信息。结合当前系统规则，部分会话/临时数据按时效策略保存（例如 24 小时会话周期）。',
        en: 'We retain data only for the period necessary to fulfill processing purposes. Under current system rules, some session/temporary data follow time-based strategies (for example, 24-hour session cycles).',
      },
      {
        zh: '超过保存期限后，我们将依法删除或去标识化处理；法律法规另有规定的除外。',
        en: 'After retention expires, data will be deleted or de-identified according to law, unless legal requirements mandate retention.',
      },
    ],
  },
  {
    title: {
      zh: '8. 你的权利',
      en: '8. Your Rights',
    },
    paragraphs: [
      {
        zh: '在法律法规规定范围内，你有权请求访问、更正、补充、删除相关个人信息，或撤回已作出的同意。',
        en: 'Within legal scope, you may request access, correction, supplementation, deletion of personal data, or withdrawal of consent.',
      },
      {
        zh: '你可通过客服邮箱 hero3791@live.com 联系我们提交请求，我们将在合理期限内处理并回复。',
        en: 'You may contact us via hero3791@live.com to submit requests, and we will respond within a reasonable period.',
      },
    ],
  },
  {
    title: {
      zh: '9. 未成年人信息保护',
      en: '9. Protection of Minors',
    },
    paragraphs: [
      {
        zh: '我们重视未成年人信息保护。未成年人应在监护人同意和指导下使用本服务。',
        en: 'We place high importance on minors’ data protection. Minors should use the service under guardian consent and guidance.',
      },
      {
        zh: '监护人可通过客服邮箱联系我们，依法行使相关权利。',
        en: 'Guardians may contact us by email to exercise relevant rights under applicable laws.',
      },
    ],
  },
  {
    title: {
      zh: '10. 政策更新',
      en: '10. Policy Updates',
    },
    paragraphs: [
      {
        zh: '我们可能根据业务变化或法律法规要求更新本政策。更新版本将在产品页面公示并标注日期。',
        en: 'We may update this policy based on business or legal changes. Updated versions will be published with effective dates.',
      },
      {
        zh: '你继续使用本服务，视为你已阅读并同意更新后的隐私政策。',
        en: 'Your continued use of the service indicates acceptance of the updated Privacy Policy.',
      },
    ],
  },
  {
    title: {
      zh: '11. 联系方式',
      en: '11. Contact',
    },
    paragraphs: [
      {
        zh: '如你对本政策有疑问、意见或投诉，请联系：hero3791@live.com。',
        en: 'If you have any questions, comments, or complaints regarding this policy, contact us at hero3791@live.com.',
      },
    ],
  },
];
