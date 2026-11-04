'use strict';
/**
 * סל טפסי הקליטה (8) - לפי רשימת הקליטה, טפסי המשטרה, טופס 101, הסכם העבודה ונספחים א'/ב'.
 * הנוסחים המשפטיים (הסכם, נספחים, 101) מוצגים כצילום המסמך המקורי (תיקיית docs), ללא שינוי.
 * ניתן לערוך הכול ממסך "סל טפסים".
 * gender_rule: 'all' לכולם, 'male' לגברים בלבד.
 */
const sig = () => ({ key: 'signature', label: 'חתימה', type: 'signature', required: true });
const today = () => ({ key: 'sign_date', label: 'תאריך', type: 'date', required: true, default: 'today' });

module.exports = [
  {
    title: 'פרטים אישיים, חשבון בנק והסכמה לתלוש דיגיטלי',
    description: 'פרטים אישיים, כתובת, פרטי חשבון בנק להעברת משכורת ואישור קבלת תלוש במייל',
    category: 'פרטים אישיים ושכר', mandatory: 1, gender_rule: 'all', is_default: 1,
    fields: [
      { key: 'full_name', label: 'שם מלא (עברית)', type: 'text', required: true, prefill: 'full_name' },
      { key: 'gender', label: 'מגדר (לקביעת טופס משטרה נכון)', type: 'radio', options: ['גבר', 'אישה'], required: true, prefill: 'gender' },
      { key: 'id_number', label: 'מספר תעודת זהות (9 ספרות)', type: 'idnumber', required: true, prefill: 'id_number' },
      { key: 'birth_date', label: 'תאריך לידה', type: 'date', required: true },
      { key: 'address', label: 'כתובת מגורים (רחוב ומספר)', type: 'text', required: true },
      { key: 'city', label: 'ישוב', type: 'text', required: true },
      { key: 'zip', label: 'מיקוד', type: 'text' },
      { key: 'phone', label: 'טלפון נייד', type: 'phone', required: true, prefill: 'phone' },
      { key: 'h_bank', label: 'פרטי חשבון בנק להעברת משכורת', type: 'heading' },
      { key: 'bank', label: 'שם הבנק / מספר בנק', type: 'text', required: true },
      { key: 'branch', label: 'מספר סניף', type: 'text', required: true },
      { key: 'account', label: 'מספר חשבון', type: 'text', required: true },
      { key: 'bank_doc', label: 'צילום שיק או אישור ניהול חשבון', type: 'file', required: true, allow_exempt: true },
      { key: 'h_mail', label: 'תלוש שכר דיגיטלי', type: 'heading' },
      { key: 'email', label: 'כתובת מייל לקבלת תלוש השכר', type: 'email', required: true, prefill: 'email' },
      { key: 'payslip_text', type: 'paragraph', text: 'הריני מאשר/ת לקבל את תלוש השכר באמצעים אלקטרוניים. ידוע לי כי בכך אני מוותר/ת על זכותי לקבל את תלוש השכר מודפס.' },
      { key: 'payslip_consent', label: 'אני מאשר/ת קבלת תלוש שכר דיגיטלי במייל', type: 'consent', required: true },
    ],
  },
  {
    title: 'בקשת בגיר לקבל אישור משטרה – אלימות כלפי ילדים וחסרי ישע',
    description: 'לפי תקנות למניעת העסקה במוסדות מסוימים של מי שהורשע באלימות כלפי ילדים וחסרי ישע, תשפ"ג–2023 (נשים וגברים)',
    category: 'בטחון ומשטרה', mandatory: 1, gender_rule: 'all', is_default: 1, institute_doc: 'institute-violence.pdf',
    fields: [
      { key: 'p1', type: 'paragraph', text: 'בקשת בגיר לקבל אישור משטרה (טופס 1, תקנה 2(א)(1)).\n\nאני החתום/ה מטה מבקש/ת כי יינתן לי אישור משטרה לכך שאין מניעה לפי החוק להעסקתי במוסד המצוין בטופס 2 (תעודת המוסד) המצורף.\n\nאם מגיש/ה הבקשה אינו/ה הבגיר/ה, יש לציין זאת ולפרט את שם הבגיר ומספר הזהות שלו.' },
      { key: 'id_number', label: 'מספר תעודת זהות', type: 'idnumber', required: true, prefill: 'id_number' },
      { key: 'full_name', label: 'שם פרטי ושם משפחה', type: 'text', required: true, prefill: 'full_name' },
      { key: 'birth_date', label: 'תאריך לידה', type: 'date', required: true },
      { key: 'address', label: 'מען (רחוב, מספר, ישוב)', type: 'text', required: true },
      { key: 'zip', label: 'מיקוד', type: 'text' },
      { key: 'consent', label: 'אני מאשר/ת ומבקש/ת לקבל אישור משטרה בהתאם לתקנות. הוראות החוק למניעת העסקה במוסד הובהרו לי.', type: 'consent', required: true },
      { key: 'police_file', label: 'העלאת אישור משטרה (אם כבר קיים)', type: 'file', allow_exempt: true },
      sig(), today(),
    ],
  },
  {
    title: 'בקשת אישור משטרה – עבירות מין (גברים בלבד)',
    description: 'לפי חוק למניעת העסקה של עברייני מין במוסדות מסוימים, התשס"א–2001 (נספח א׳, חל על גברים בלבד)',
    category: 'בטחון ומשטרה', mandatory: 1, gender_rule: 'male', is_default: 1, institute_doc: 'institute-sex.pdf',
    fields: [
      { key: 'p1', type: 'paragraph', text: 'בקשת בגיר לקבל אישור משטרה (נספח א׳, טופס 1, תקנה 2(א)(1) ו-(ב)(2)).\n\nאני החתום/ה מטה מבקש/ת כי יינתן לי אישור משטרה לכך שאין מניעה לפי החוק להעסקתי במוסד המצוין בטופס 2 (תעודת מוסד) המצורף.' },
      { key: 'id_number', label: 'מספר תעודת זהות', type: 'idnumber', required: true, prefill: 'id_number' },
      { key: 'full_name', label: 'שם פרטי ושם משפחה', type: 'text', required: true, prefill: 'full_name' },
      { key: 'birth_date', label: 'תאריך לידה', type: 'date', required: true },
      { key: 'address', label: 'מען (רחוב, מספר, ישוב)', type: 'text', required: true },
      { key: 'zip', label: 'מיקוד', type: 'text' },
      { key: 'consent', label: 'אני מאשר/ת ונותן/ת ייפוי כוח למוסד לקבלת אישור המשטרה בשמי', type: 'consent', required: true },
      { key: 'police_file', label: 'העלאת אישור משטרה לעבירות מין (אם כבר קיים)', type: 'file', allow_exempt: true },
      sig(), today(),
    ],
  },
  {
    title: 'טופס 101 – כרטיס עובד',
    description: 'כרטיס עובד לצורכי מס הכנסה: הורדה, מילוי והעלאת צילום חתום',
    category: 'פרטים אישיים ושכר', mandatory: 1, gender_rule: 'all', is_default: 1,
    fields: [
      { key: 'p1', type: 'paragraph', text: '1. הורידו את טופס 101 (קובץ PDF) או עיינו בו כאן.\n2. מלאו את פרטיכם וחתמו עליו.\n3. צלמו את הטופס החתום (כל העמודים) או העלו קובץ PDF.\n\nאם יש לכם תיאום מס, העלו אותו במסמכים הנלווים.' },
      { key: 'doc101', type: 'document', label: 'טופס 101', doc: 'form101', pages: 2, download: 'form101.pdf' },
      { key: 'form101_file', label: 'צילום טופס 101 חתום', type: 'file', required: true },
      { key: 'form101_file2', label: 'עמוד נוסף (אם יש)', type: 'file' },
    ],
  },
  {
    title: 'צילום תעודת זהות ומסמכים נלווים',
    description: 'תעודת זהות וספח, קורות חיים, אישור רפואי, תיאום מס, אישור קופת פנסיה, ועובד סוציאלי (לפי הצורך)',
    category: 'מסמכים', mandatory: 1, gender_rule: 'all', is_default: 1,
    fields: [
      { key: 'p1', type: 'paragraph', text: 'ניתן לצלם ישירות מהטלפון. ודאו שכל הפרטים קריאים. אם אין לכם מסמך מסוים, לחצו על "אין לי מסמך זה" וציינו סיבה.' },
      { key: 'id_front', label: 'תעודת זהות', type: 'file', required: true },
      { key: 'id_back', label: 'ספח תעודת זהות (כולל פרטי ילדים)', type: 'file', required: true, allow_exempt: true },
      { key: 'cv', label: 'קורות חיים מעודכנים', type: 'file', required: true, allow_exempt: true },
      { key: 'medical', label: 'אישור רפואי מרופא משפחה', type: 'file', required: true, allow_exempt: true },
      { key: 'social_worker', label: 'עובד סוציאלי: צילום תעודת רישום ואישור זכאות לתואר', type: 'file', allow_exempt: true },
      { key: 'tax_coord', label: 'תיאום מס ממעסיק קודם / מס הכנסה (אם יש)', type: 'file', allow_exempt: true },
      { key: 'h_pension', label: 'קופת פנסיה', type: 'heading' },
      { key: 'pension_active', label: 'האם קיימת קופת פנסיה פעילה על שמך?', type: 'radio', options: ['כן', 'לא'], required: true },
      { key: 'pension_details', label: 'שם הקופה / קוד קופה (אם יש)', type: 'text' },
      { key: 'pension_doc', label: 'אישור פנסיה / פרטי קופה', type: 'file', allow_exempt: true },
    ],
  },
  {
    title: 'הסכם עבודה אישי',
    description: 'הסכם עבודה אישי (מדריך/ת דיור): קריאה ואישור בחתימה דיגיטלית',
    category: 'העסקה והסכמים', mandatory: 1, gender_rule: 'all', is_default: 1,
    fields: [
      { key: 'doc', type: 'document', label: 'הסכם עבודה', doc: 'contract', pages: 3 },
      { key: 'id_number', label: 'מספר תעודת זהות', type: 'idnumber', required: true, prefill: 'id_number' },
      { key: 'address', label: 'כתובת מגורים', type: 'text', required: true },
      { key: 'phone', label: 'טלפון נייד', type: 'phone', required: true, prefill: 'phone' },
      { key: 'consent', label: 'קראתי והבנתי את הסכם העבודה ואני מסכים/ה לכל תנאיו', type: 'consent', required: true },
      sig(), today(),
    ],
  },
  {
    title: 'נספח א׳ – הסכם פטור לפיצויי פיטורים (סעיף 14)',
    description: 'נוסח הצהרה בדבר הפרשות מעביד שיבואו במקום פיצויי פיטורים לפי סעיף 14 לחוק פיצויי פיטורים',
    category: 'העסקה והסכמים', mandatory: 1, gender_rule: 'all', is_default: 1,
    fields: [
      { key: 'doc', type: 'document', label: 'נספח א׳', doc: 'appendixa', pages: 1 },
      { key: 'consent', label: 'קראתי והבנתי את נספח א׳ ואני מסכים/ה לאמור בו', type: 'consent', required: true },
      sig(), today(),
    ],
  },
  {
    title: 'נספח ב׳ – התחייבות לשמירה על סודיות',
    description: 'תצהיר והתחייבות לשמירת סודיות ופרטיות',
    category: 'העסקה והסכמים', mandatory: 1, gender_rule: 'all', is_default: 1,
    fields: [
      { key: 'doc', type: 'document', label: 'נספח ב׳', doc: 'appendixb', pages: 1 },
      { key: 'role', label: 'תפקיד', type: 'text', required: true },
      { key: 'consent', label: 'קראתי והבנתי את ההתחייבות לשמירת סודיות ואני מסכים/ה לה', type: 'consent', required: true },
      sig(), today(),
    ],
  },
];
