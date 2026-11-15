import { PRODUCT_IDENTITY } from '@/content/productIdentity';
export type LocalizedText = {
  zh: string;
  en: string;
};

export type AgreementSection = {
  title: LocalizedText;
  paragraphs: LocalizedText[];
};

export const AGREEMENT_LAST_UPDATED = '2026-10-11';

export const AGREEMENT_SUMMARY: LocalizedText = {
  zh: `本协议适用于 ${PRODUCT_IDENTITY.name}全部服务。你注册、登录或继续使用本产品，即视为已阅读并同意本协议及《隐私政策》。`,
  en: `This agreement applies to all ${PRODUCT_IDENTITY.nameEn} services. By registering, logging in, or continuing to use the product, you agree to this agreement and the Privacy Policy.`,
};

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    title: {
      zh: '1. 协议的接受与适用',
      en: '1. Acceptance and Scope',
    },
    paragraphs: [
      {
        zh: `本协议由你与运营者卢丹（个体经营者）就 ${PRODUCT_IDENTITY.name}服务使用事宜订立。`,
        en: `This agreement is entered into between you and the operator, Lu Dan, regarding the use of ${PRODUCT_IDENTITY.nameEn} services.`,
      },
      {
        zh: '你在注册、登录、访问或使用本服务时，即表示你已阅读、理解并同意本协议及《隐私政策》。',
        en: 'By registering, logging in, accessing, or using this service, you confirm that you have read and agreed to this agreement and the Privacy Policy.',
      },
      {
        zh: '若你未满 18 周岁，应在监护人同意和指导下使用本服务。',
        en: 'If you are under 18, you must use the service with guardian consent and guidance.',
      },
    ],
  },
  {
    title: {
      zh: '2. 服务内容',
      en: '2. Service Description',
    },
    paragraphs: [
      {
        zh: '本服务为学习辅助工具，提供拍照/上传、作业识别、自动批改、错题归档、知识点统计、分析报告、AI 辅导等功能。',
        en: 'The service is a learning-assistance tool providing upload, recognition, grading, mistake archiving, knowledge statistics, analytics reports, and AI tutoring.',
      },
      {
        zh: '我们可根据业务发展、技术条件和合规要求对服务进行新增、调整、限制、暂停或下线。',
        en: 'We may add, adjust, limit, suspend, or discontinue features based on business, technical, and compliance needs.',
      },
    ],
  },
  {
    title: {
      zh: '3. 账号与安全',
      en: '3. Account and Security',
    },
    paragraphs: [
      {
        zh: '你应提供真实、合法、有效的信息进行注册或登录，并妥善保管账号及验证码等凭证。',
        en: 'You must provide true and lawful information and properly safeguard account credentials and verification codes.',
      },
      {
        zh: '你不得出租、出借、买卖、转让账号，不得冒用他人身份。',
        en: 'You must not rent, lend, sell, or transfer your account, or impersonate others.',
      },
      {
        zh: '若发现账号异常或疑似被盗用，请及时通过客服邮箱联系我们。',
        en: 'If you detect abnormal account behavior or suspected compromise, contact support promptly by email.',
      },
    ],
  },
  {
    title: {
      zh: '4. 家庭档案与未成年人使用',
      en: '4. Family Profiles and Minors',
    },
    paragraphs: [
      {
        zh: '本服务面向家庭学习场景，建议由监护人统一管理主账号和孩子档案。',
        en: 'This service is designed for family learning scenarios, and guardian-managed accounts are recommended.',
      },
      {
        zh: '你确认对上传内容拥有合法权利或已取得必要授权。',
        en: 'You confirm you have lawful rights or proper authorization for uploaded content.',
      },
    ],
  },
  {
    title: {
      zh: '5. 用户行为规范',
      en: '5. User Conduct Rules',
    },
    paragraphs: [
      {
        zh: '你不得利用本服务上传、发布或传播违法违规、侵权、侮辱诽谤、低俗暴力等信息。',
        en: 'You must not use this service to upload or distribute unlawful, infringing, defamatory, abusive, or harmful content.',
      },
      {
        zh: '你不得实施爬虫抓取、逆向工程、绕过安全机制、批量滥用接口等行为。',
        en: 'You must not perform scraping, reverse engineering, security bypass, or abusive bulk API usage.',
      },
      {
        zh: '如你违反本条约定，我们有权采取警告、限制功能、暂停或终止服务，并依法追责。',
        en: 'If you violate this section, we may issue warnings, restrict features, suspend/terminate services, and pursue legal liability.',
      },
    ],
  },
  {
    title: {
      zh: '6. 用户内容与授权',
      en: '6. User Content and License',
    },
    paragraphs: [
      {
        zh: '你对依法享有权利的上传内容保留相应权利。',
        en: 'You retain rights over uploaded content where legally applicable.',
      },
      {
        zh: '为提供服务，你授权我们在必要范围内对上传内容进行处理，包括识别、分析、展示、存储、归档与报告生成。',
        en: 'To deliver the service, you grant us a necessary-scope license to process uploaded content for recognition, analysis, display, storage, archiving, and report generation.',
      },
      {
        zh: '你应保证上传内容不侵犯第三方合法权益。',
        en: 'You must ensure uploaded content does not infringe third-party rights.',
      },
    ],
  },
  {
    title: {
      zh: '7. AI 能力声明',
      en: '7. AI Capability Disclaimer',
    },
    paragraphs: [
      {
        zh: '本服务输出的批改结果、知识点分析、辅导建议和报告结论属于学习辅助信息，可能存在误差。',
        en: 'Outputs such as grading, knowledge analysis, tutoring guidance, and reports are assistive and may contain errors.',
      },
      {
        zh: '相关输出不构成学校官方评分或专业意见，你应结合教材、教师反馈和实际情况自主判断。',
        en: 'Outputs do not constitute official school grading or professional advice; you should make your own judgment with teacher and curriculum context.',
      },
    ],
  },
  {
    title: {
      zh: '8. 知识产权',
      en: '8. Intellectual Property',
    },
    paragraphs: [
      {
        zh: '本服务的软件、页面、算法、文档、标识等知识产权归运营者或相关权利人所有。',
        en: 'Intellectual property rights for software, pages, algorithms, documentation, and marks belong to the operator or rights holders.',
      },
      {
        zh: '未经授权，你不得复制、改编、反向工程、传播或商业化利用。',
        en: 'Without authorization, you may not copy, adapt, reverse engineer, distribute, or commercially exploit the service.',
      },
    ],
  },
  {
    title: {
      zh: '9. 付费与权益（如适用）',
      en: '9. Payments and Entitlements (If Applicable)',
    },
    paragraphs: [
      {
        zh: '部分服务可能涉及订阅、报告券等增值权益，具体以页面展示和订单信息为准。',
        en: 'Some services may involve paid entitlements (such as subscriptions or report coupons), subject to on-page descriptions and orders.',
      },
      {
        zh: '已消耗或已完成交付的数字服务，原则上不支持退回；法律法规另有规定的除外。',
        en: 'Consumed or fully delivered digital services are generally non-refundable unless otherwise required by law.',
      },
    ],
  },
  {
    title: {
      zh: '10. 服务变更、中断与终止',
      en: '10. Service Changes, Interruptions, and Termination',
    },
    paragraphs: [
      {
        zh: '因系统维护、网络故障、第三方服务异常、不可抗力或监管要求，服务可能中断或受限。',
        en: 'Services may be interrupted or limited due to maintenance, network failures, third-party outages, force majeure, or regulatory requirements.',
      },
      {
        zh: '如你违反本协议或法律法规，我们可限制、暂停或终止向你提供服务。',
        en: 'If you violate this agreement or laws, we may restrict, suspend, or terminate your access.',
      },
    ],
  },
  {
    title: {
      zh: '11. 免责声明与责任限制',
      en: '11. Disclaimer and Limitation of Liability',
    },
    paragraphs: [
      {
        zh: '在法律允许范围内，我们不对因网络波动、设备故障、第三方服务中断、不可抗力导致的间接损失承担责任。',
        en: 'To the extent permitted by law, we are not liable for indirect losses caused by network fluctuations, device failures, third-party outages, or force majeure.',
      },
      {
        zh: '我们将尽合理努力保障服务稳定和安全，但不承诺服务绝对不中断或输出绝对无误。',
        en: 'We use reasonable efforts to maintain stability and security, but do not guarantee uninterrupted service or error-free outputs.',
      },
    ],
  },
  {
    title: {
      zh: '12. 协议更新',
      en: '12. Agreement Updates',
    },
    paragraphs: [
      {
        zh: '我们可根据业务发展和法律法规变化更新本协议。更新版本将通过产品页面发布并标注日期。',
        en: 'We may update this agreement due to business or legal changes. Updated versions will be published with dates.',
      },
      {
        zh: '你继续使用本服务，视为你已阅读并同意更新后的协议。',
        en: 'Your continued use of the service indicates acceptance of the updated agreement.',
      },
    ],
  },
  {
    title: {
      zh: '13. 法律适用与争议解决',
      en: '13. Governing Law and Dispute Resolution',
    },
    paragraphs: [
      {
        zh: '本协议适用中华人民共和国法律（不含冲突规范）。',
        en: 'This agreement is governed by the laws of the People’s Republic of China (excluding conflict-of-law rules).',
      },
      {
        zh: '因本协议引发争议，双方应先协商；协商不成的，提交有管辖权的人民法院处理。',
        en: 'Disputes should first be resolved through negotiation; if unsuccessful, they shall be submitted to a competent People’s Court.',
      },
    ],
  },
  {
    title: {
      zh: '14. 联系方式',
      en: '14. Contact',
    },
    paragraphs: [
      {
        zh: '如你对本协议有疑问、意见或投诉，请联系：hero3791@live.com。',
        en: 'If you have any questions, comments, or complaints regarding this agreement, contact: hero3791@live.com.',
      },
    ],
  },
];
