/* מצגת לשינוי בקו — ממשק באנגלית (שלמה 24.11): "עברית | English" בסרגל השלבים, נשמר (localStorage lc-lang ו-?lang=en).
   הטקסטים בקוד ובדף נשארים בעברית (המקור); כאן — מילון אחד מהטקסט העברי לאנגלית (UI), ותבניות לטקסטים עם מספרים (UIP).
   התרגום רץ על הדף עצמו: כל טקסט ותכונה (placeholder, aria-label, title) שנוספים לדף — גם אחר כך (MutationObserver).
   לא נוגעים בשקפים עצמם (.sframe — שם "שפת הלוח", board-en.js), ולא בשמות (תחנות, ערים, חברות) — הם לא במילון.
   טקסט חדש בממשק = מפתח חדש כאן (ראו CLAUDE.md). "מה חדש" וכותרת התחתית של האתר (version.js) — נשארים בעברית. */
(function (g) {
  var UI = {
    // כותרת ושלבים
    'מצגת לשינוי בקו': 'Line change slides', 'הקו הבוחן · מצגות לנוסעים': 'HaKav HaBochen · slides for passengers',
    'בוחרים קו ושינוי, מתקנים את הטקסט אם צריך, ומורידים מצגת PDF שמסבירה לנוסעים מה משתנה: במילים, במפה וברשימת התחנות.': 'Pick a line and a change, fix the text if needed, and download a PDF that explains to passengers what changes: in words, on a map and in the list of stops.',
    'מצגת לשינוי בקו · הקו הבוחן': 'Line change slides · HaKav HaBochen',
    'שלבים': 'Steps', 'א׳': 'Sun', 'ב׳': 'Mon', 'ג׳': 'Tue', 'ד׳': 'Wed', 'ה׳': 'Thu', 'ו׳': 'Fri', 'ש׳': 'Sat',
    'שער': 'Cover', 'סיום: לפני הנסיעה בדקו': 'Closing: check before you travel', 'לוח זמנים': 'Timetable', 'חזרה לשלב הקודם': 'Back to the previous step', 'חזרה': 'Back', 'איזה קו?': 'Which line?', 'איזה קווים?': 'Which lines?', 'איזה שינוי?': 'Which change?', 'המצגת': 'The slides',
    'איפוס': 'Reset', 'שפת הממשק': 'Interface language', 'להתחיל מחדש? כל הקווים והבחירות יימחקו': 'Start over? All lines and choices will be cleared', 'כן, לאפס': 'Yes, reset', 'ביטול': 'Cancel',
    '→': '←', '←': '→', '→ לכל התוצאות': '← All results',
    // שלב 1
    'הכנת המצגת': 'Preparing the slides', 'מה מכינים?': 'What are you making?', 'מה מכינים': 'What are you making',
    'הודעה על שינוי': 'Change notice', 'קו שמשנה מסלול או לו״ז, קו חדש או מבוטל': 'A line that changes route or timetable, a new or cancelled line',
    'לו״ז עדכני': 'Current timetable', 'כל קו, גם בלי שינוי — להדפסה ולהפצה': 'Any line, even without a change — to print and share',
    'מספר קו, רחוב, שכונה, עיר או חברה.': 'Line number, street, neighbourhood, city or operator.', 'חיפוש קו': 'Search for a line',
    'למשל 988, הרצל, קרית חב"ד': 'e.g. 988, Herzl, Kiryat Chabad', 'למשל 494, גני איילון, אופקים ירושלים': 'e.g. 494, Ganei Ayalon, Ofakim Jerusalem',
    'שינויים קרובים ב:': 'Upcoming changes in:', 'ערים עם שינויים קרובים': 'Cities with upcoming changes', 'סוג השינוי': 'Type of change',
    'טוען את רשימת הקווים': 'Loading the list of lines', 'מספר קו, שכונה, רחוב, עיר או חברה. בשכונה או ברחוב — כל הקווים שעוצרים שם, בלוח אחד.': 'Line number, neighbourhood, street, city or operator. A neighbourhood or street gives all the lines that stop there, in one board.',
    'כל הקווים במקום': 'All lines in this place', 'קווים': 'Lines', 'רחובות ושכונות': 'Streets and neighbourhoods', 'רחובות': 'Streets', 'שכונות': 'Neighbourhoods', 'ערים': 'Cities',
    'טוען רחובות ושכונות…': 'Loading streets and neighbourhoods…', 'אין כאן קווי אוטובוס.': 'No bus lines here.',
    'לא מצאנו. נסו מספר קו, שכונה, רחוב, עיר או חברה.': 'Nothing found. Try a line number, neighbourhood, street, city or operator.',
    'לא מצאנו. נסו מספר קו, רחוב, שכונה, עיר או חברה.': 'Nothing found. Try a line number, street, neighbourhood, city or operator.',
    'כתבו מספר קו, עיר או חברה — ויופיעו כל הקווים, גם בלי שינוי.': 'Type a line number, city or operator — all lines appear, even without a change.',
    'לא הצלחנו לטעון את רשימת הקווים. נסו לרענן את הדף.': 'Could not load the list of lines. Try reloading the page.',
    'אין שינויים קרובים בקווים במקום הזה. אפשר לחפש לפי מספר קו.': 'No upcoming changes for lines in this place. You can search by line number.',
    'אין שינויים קרובים בקווים שעוצרים כאן.': 'No upcoming changes for lines that stop here.',
    'אין לו״ז לקו הזה בשבוע הקרוב': 'No timetable for this line in the coming week', 'אין לו״ז לקווים האלה בשבוע הקרוב': 'No timetable for these lines in the coming week',
    'קווים שמשתנים בשבועיים הקרובים או השתנו בשבועיים האחרונים': 'Lines changing in the next two weeks or changed in the last two weeks',
    'הקווים עם שינוי מסלול': 'Lines with a route change', 'הקווים עם שינוי בלו״ז': 'Lines with a timetable change', 'הקווים החדשים': 'New lines', 'הקווים שמבוטלים': 'Cancelled lines',
    'הקווים עם שינוי שכבר התחיל': 'Lines with a change that already started', 'הקווים למצגת אחת': 'Lines for one set of slides',
    'הכול': 'All', 'שינוי מסלול': 'Route change', 'שינוי בלו״ז': 'Timetable change', 'קו חדש': 'New line', 'קו מבוטל': 'Cancelled line', 'כבר התחילו': 'Already started',
    'מומלץ': 'Recommended', 'כל הקווים': 'All lines', 'קו אחד משתנה': 'A line changes', 'קו אחד עוצר כאן': 'One line stops here', 'קו אחד': 'One line',
    // שלב 2
    'אין שינוי בקו הזה בשבועיים הקרובים או בשבועיים האחרונים.': 'No change on this line in the next two weeks or the last two weeks.',
    'השינוי עודכן — זה המידע העדכני על הקו': 'The change was updated — this is the current information on the line',
    'בקרוב': 'Soon', 'נכנס לתוקף': 'Takes effect', 'היה ב': 'Was on', 'היה ב-': 'Was on ', 'מהארכיון': 'from the archive',
    'הקו מתחיל לנסוע': 'Line starts running', 'הקו התחיל לנסוע': 'Line started running', 'הנסיעה האחרונה': 'Last trip', 'לוח זמנים חדש מ': 'New timetable from',
    'מפה של המסלול, התחנות ומתי הקו נוסע': 'Map of the route, the stops and when the line runs', 'מפה של המסלול, ואילו קווים עוצרים באותן תחנות': 'Map of the route, and which lines stop at the same stops',
    'הלוח הישן והחדש — כללי או מפורט': 'The old and new timetable — summary or detailed', 'הלוך וחזור': 'Both directions', 'רק בנסיעה לצד אחד': 'One direction only',
    'שינוי קטן — עמוד אחד': 'Small change — one page', 'שינוי גדול — מצגת מלאה': 'Big change — full slides', 'שינוי קטן': 'Small change', 'שינוי גדול': 'Big change',
    'השוואה משוערת': 'Estimated comparison', 'אין פרטים': 'No details', 'טוען…': 'Loading…', 'לא הצלחנו לטעון את הפרטים של השינוי הזה': 'Could not load the details of this change',
    'הקו נוסע בדרך אחרת': 'The line takes a different route', 'הקו ממשיך יותר רחוק': 'The line extends further', 'הקו מתחיל מוקדם יותר': 'The line starts further back', 'הקו מתארך': 'The route is extended',
    'חלופה בוטלה': 'Variant cancelled', 'חלופה חדשה': 'New variant', 'תחנה אחת מבוטלת': 'One stop cancelled', 'תחנה חדשה אחת': 'One new stop', 'תחנה אחת עוברת מקום': 'One stop is relocated',
    'היום': 'Today', 'מחר': 'Tomorrow', 'בעוד יומיים': 'In 2 days', 'אתמול': 'Yesterday', 'לפני יומיים': '2 days ago',
    // שלב 3 — הגדרות
    'הקווים במצגת': 'Lines in the slides', '+ להוסיף קו נוסף': '+ Add another line', 'גודל המצגת': 'Size of the slides',
    'להפוך למצגת מלאה': 'Make full slides', 'לעמוד אחד': 'One page', '(לפי הבחירה שלכם)': '(your choice)', 'עמוד אחד': 'One page', 'מצגת מלאה': 'Full slides',
    'איך להציג את לוח הזמנים': 'How to show the timetable', 'ההורדה ל-PDF ולאקסל תהיה לפי מה שתבחרו כאן': 'The PDF and Excel downloads follow what you choose here',
    'לוח מודעות': 'Board', 'שורה לכל קו, עמודה לכל יום. מה שמשתנה מסומן בצבע': 'A row per line, a column per day. Changes are marked in colour', 'שורה לכל קו, עמודה לכל יום': 'A row per line, a column per day',
    'תקציר': 'Summary', 'כמה נסיעות, מתי ובאיזו תדירות': 'How many trips, when and how often', 'טבלה לכל קו': 'Table per line', 'כל קו בטבלה משלו, כל השעות': 'Each line in its own table, all times',
    'טבלה משולבת': 'Combined table', 'כל השעות לאותו יעד יחד': 'All times to the same destination together', 'כל השעות לאותו יעד יחד. מופיע כשיש כמה קווים לאותו יעד': 'All times to the same destination together. Available when several lines go to the same destination',
    'להציג את כל השעות': 'Show all times', 'אפשרויות ללוח המודעות': 'Board options', 'שפת הלוח': 'Board language', 'שפת המצגת': 'Language of the slides', 'עברית': 'Hebrew', 'עורכים בעברית, מדפיסים באנגלית': 'Edit in Hebrew, print in English',
    'כותרת': 'Title', 'במצב עריכה: לוחצים על שורה בלוח ובוחרים "מחיקת השורה" או "מחיקת הקו". כל טקסט בלוח אפשר גם לשנות או למחוק. בלחיצה על הכותרת, על שורה או על תא — גם עיצוב: רקע, צבע טקסט, יישור, ערכות צבעים לכל הלוח, וכותרת רק בעמוד הראשון.': 'In edit mode: click a row on the board and choose "Delete row" or "Delete line". Any text on the board can also be changed or deleted. Clicking the title, a row or a cell also gives formatting: background, text colour, alignment, colour sets for the whole board, and title on the first page only.',
    'עדכונים והערות': 'Updates and notes', '(לא חובה — מופיע בתחתית הלוח)': '(optional — shown at the bottom of the board)', 'צפיפות': 'Density', 'רגילה': 'Normal', 'צפופה': 'Compact',
    'להכניס ל־ (בשלט A4)': 'Fit into (A4 sign)', 'כמה עמודים': 'How many pages', 'שני עמודים': 'Two pages', 'כמה שצריך': 'As many as needed',
    'מתחת למוצא': 'Below the origin stop', 'הכל': 'All', 'רק כיוון': 'Direction only', 'כלום': 'Nothing', 'יישור הכותרת': 'Title alignment', 'לימין': 'Right', 'למרכז': 'Centre',
    'הכותרת ושורת "בתוקף"': 'Title and "valid" line', 'הכותרת בכל עמוד': 'Title on every page', 'בכל עמוד': 'Every page', 'רק בעמוד הראשון': 'First page only',
    'צבעים': 'Colours', 'לפי העיצוב': 'By design', 'כחול': 'Blue', 'ירוק': 'Green', 'אפור': 'Grey', 'צהוב': 'Yellow', 'רקע הכותרות': 'Heading background', 'טקסט הכותרות': 'Heading text', 'רקע השעות': 'Times background', 'טקסט השעות': 'Times text',
    'פיצול ימי חול': 'Split weekdays', 'אוטומטי': 'Automatic', 'לא': 'No', 'שם המפעיל': 'Operator name', 'להציג': 'Show', 'בלי': 'Hide', 'תאריך סיום ("עד…")': 'End date ("until…")', 'תאריך סיום': 'End date',
    'סימון נסיעות כפולות (×2)': 'Double trips mark (×2)', 'סימון נסיעות כפולות': 'Double trips mark', 'קווים עם אות (1 ו־1א)': 'Lines with a letter (1 and 1א)', 'קווים עם אות': 'Lines with a letter',
    'שורה אחת': 'One row', 'כמו היום': 'As today', 'בנפרד': 'Separate', '1 ו־1א בשורות נפרדות': '1 and 1א in separate rows',
    'בחירת תאריכים': 'Choose dates', 'סדר העמודות': 'Column order', 'סדר מקורי': 'Original order', 'הצעות': 'Suggestions', 'הצעה:': 'Suggestion:', 'יש בחירה': 'Dates chosen', 'תאריכים': 'Dates', 'לבטל את הבחירה': 'Clear the choice', 'נפרד': 'Separate',
    'הלוח נבנה מהתאריך הראשון של כל יום בשבוע (מודגש). לחיצה על תאריך מוציאה אותו — ואז נלקח אותו יום בשבוע הבא. "נפרד" — עמודה משלו עם התאריך. נקודה — השעות שונות מאותו יום בשבוע האחר.': 'The board uses the first date of each weekday (bold). Tap a date to leave it out — the same weekday next week is used instead. "Separate" — its own column with the date. Dot — the times differ from the same weekday in the other week.',
    'סדר הקווים': 'Line order', 'לפי סוג קו': 'By line type', 'לפי הסדר שהוספתם': 'In the order you added', 'לפי יעד': 'By destination', 'לפי מפעיל': 'By operator', 'לפי מספר קו': 'By line number', 'ידני': 'Manual',
    'במצב עריכה: לוחצים על קו או על פס בלוח, ומזיזים עם "העברה למעלה ↑" / "העברה למטה ↓". קו שבראש פס עובר בלחיצה על ↑ לפס שמעליו (ו-↓ בסוף פס — לפס שמתחתיו), ושם הוא מופיע בפס משלו, עם היעד שלו. קו שעומד לבד בפס משלו זז כמו פס — מעל הפס שמעליו או מתחת לפס שמתחתיו.': 'In edit mode: click a line or a band on the board and move it with "Move up ↑" / "Move down ↓". A line at the top of a band moves with ↑ to the band above (and ↓ at the end of a band — to the band below), where it gets its own band with its destination. A line alone in its band moves like a band — above the band above it or below the band below it.',
    'קודם לפי': 'First by', 'ואז לפי': 'Then by', 'סדר הסוגים': 'Order of types', 'סדר המפעילים': 'Order of operators', 'בלי פסי יעד': 'No destination bands', '(רשימה אחת של קווים, לפי הסדר שבחרתם)': '(one list of lines, in the order you chose)',
    'סוג קו': 'Line type', 'מפעיל': 'Operator', 'יעד': 'Destination', 'מספר קו': 'Line number', 'הסדר שהוספתם': 'Order added', 'עירוני': 'City', 'בין-עירוני': 'Intercity', 'אזורי': 'Regional', 'אין קווים': 'No lines',
    'רוחב עמודות': 'Column width', 'אוטומטי — הרוחב של כל עמודה נקבע כך שהלוח יהיה הכי נמוך. ידני — במצב עריכה גוררים את הקו שבין העמודות בכותרת של הלוח.': 'Automatic — each column width is set so the board is as short as possible. Manual — in edit mode, drag the line between columns in the board header.',
    'סדר השעות': 'Time order', 'משמאל לימין': 'Left to right', 'מימין לשמאל': 'Right to left',
    'צבעי המסלול במפה': 'Route colours on the map', 'רק מה שהשתנה': 'Only what changed', 'אפור למסלול שלא השתנה, ירוק לקטע החדש': 'Grey for the unchanged route, green for the new part', 'כל המסלול החדש': 'The whole new route', 'כל המסלול החדש בירוק': 'The whole new route in green',
    'מפות מקורבות לתחנות': 'Close-up maps of stops', 'כן': 'Yes', 'מפה קרובה לכל יישוב או שכונה שהקו נכנס אליהם': 'A close-up map for each town or neighbourhood the line enters', 'רק מפה של כל המסלול': 'Only a map of the whole route',
    'צורה': 'Format', 'מצגת': 'Slides', 'שלט להדפסה': 'Printed sign', 'A4 לאורך': 'A4 portrait', 'סטטוס': 'Status', 'תמונה לווטסאפ': 'Image for WhatsApp',
    'עיצוב': 'Design', 'הקו הבוחן': 'HaKav HaBochen', 'בהיר ונקי': 'Light and clean', 'צבעי המפעיל': 'Operator colours', 'אותיות גדולות': 'Large letters',
    'הטקסט': 'The text', 'הטקסט נוצר אוטומטית מהנתונים. במצב עריכה לוחצים על כל טקסט בשקף כדי לשנות, למחוק או להוסיף שורה; אפשר גם להוסיף תיבת טקסט, תמונה (מהקובץ, או הדבקה עם Ctrl+V) או שקף שלם. התמונות נשארות אצלכם ולא עולות לשום מקום.': 'The text is generated from the data. In edit mode click any text on a slide to change it, delete it or add a line; you can also add a text box, an image (from a file, or paste with Ctrl+V) or a whole slide. Images stay on your device and are not uploaded anywhere.',
    'עריכת הטקסט': 'Edit text', 'סיום העריכה': 'Finish editing', 'שחזור הכול': 'Restore all', 'השקפים במצגת': 'Slides in the deck', 'שם הקובץ להורדה': 'File name for download',
    'הורדת PDF': 'Download PDF', 'הורדת תמונה': 'Download image', 'הורדת תמונות': 'Download images', 'ייצוא לאקסל': 'Export to Excel', 'אקסל': 'Excel', 'הורדה': 'Download',
    'להוסיף קרדיט לקו הבוחן בסוף המצגת': 'Add a HaKav HaBochen credit at the end', 'להוסיף קרדיט לקו הבוחן בתחתית השלט': 'Add a HaKav HaBochen credit at the bottom of the sign', 'להוסיף את הכתובת של הקו הבוחן לתמונה': 'Add the HaKav HaBochen address to the image',
    'קובץ PDF, שקף בכל עמוד.': 'A PDF file, one slide per page.', 'קובץ PDF בגודל A4 לאורך, שלט בכל עמוד — להדפסה ולתלייה.': 'An A4 portrait PDF, one sign per page — to print and hang.', 'תמונה (PNG) בגודל של סטטוס בווטסאפ, לכל שינוי.': 'A WhatsApp-status-sized image (PNG) for each change.',
    'רוצים להדפיס?': 'Want to print?', 'הדפסה': 'Print', 'תצוגה מקדימה': 'Preview', 'מצב עריכה: לוחצים על טקסט בשקף כדי לשנות אותו. בטלפון אפשר להגדיל את השקף עם שתי אצבעות.': 'Edit mode: click text on a slide to change it. On a phone you can zoom the slide with two fingers.',
    'שקף אחד': 'One slide', 'תמונה אחת': 'One image', 'מכין PDF…': 'Preparing PDF…', 'מכין את המפות…': 'Preparing the maps…', 'מכין את התמונה…': 'Preparing the image…', 'מכין את קובץ האקסל…': 'Preparing the Excel file…', 'מכין תמונות…': 'Preparing images…',
    'ההורדה בוטלה.': 'Download cancelled.', 'לא הצלחנו להכין את קובץ האקסל. נסו שוב.': 'Could not prepare the Excel file. Try again.', 'לא הצלחנו ליצור את התמונות. נסו שוב, או צלמו את המסך.': 'Could not create the images. Try again, or take a screenshot.',
    'לא הצלחנו ליצור את קובץ ה-PDF. נפתח חלון ההדפסה — שם בוחרים "שמירה כ-PDF".': 'Could not create the PDF. The print window will open — choose "Save as PDF" there.',
    'התמונה ירדה. אפשר להוריד אותה שוב:': 'The image was downloaded. You can download it again:', 'התמונות ירדו. אפשר להוריד כל אחת שוב:': 'The images were downloaded. You can download each one again:',
    'לשמירה בתמונות: לחיצה ארוכה על התמונה ← "הוספה לתמונות".': 'To save to Photos: long-press the image → "Add to Photos".', 'טוען את המפה שוב…': 'Loading the map again…',
    'לנסות שוב': 'Try again', 'להוריד בכל זאת': 'Download anyway', 'שמירה': 'Save', 'בלי תיאור': 'No description',
    // עריכה בשקפים ובלוח (סרגלים)
    'לא לכלול את השקף': 'Leave this slide out', 'להחזיר את השקף': 'Bring the slide back', 'השקף הזה לא ייכלל במצגת': 'This slide will not be included', 'מחיקת השקף': 'Delete slide', 'מחיקת התיבה': 'Delete box',
    '+ תיבת טקסט': '+ Text box', '+ תמונה': '+ Image', '+ שקף תמונה': '+ Image slide', '+ שקף טקסט כאן': '+ Text slide here', 'הוספת תמונה לשקף הזה': 'Add an image to this slide', 'שקף חדש עם תמונה על כל השקף, אחרי השקף הזה': 'A new full-slide image after this slide', 'תיאור התמונה': 'Image description', 'תיאור': 'Description', 'איפוס מפה': 'Reset map', 'הגדלה +': 'Zoom in +', 'הקטנה −': 'Zoom out −',
    'הסתרה / החזרה': 'Hide / show', 'הסתרת מפת ההתמצאות': 'Hide the overview map', 'הטקסט ארוך מדי לשקף — קצרו אותו': 'The text is too long for the slide — shorten it',
    'מחיקה': 'Delete', '+ שורה אחרי': '+ Line after', 'שחזור': 'Restore', 'ריקון התא': 'Clear cell', 'שחזור התא': 'Restore cell', 'הוספת שורה מתחת': 'Add row below', 'מעבר לעמוד הבא': 'Page break', 'ביטול המעבר לעמוד הבא': 'Remove page break',
    'העברה למעלה ↑': 'Move up ↑', 'העברה למטה ↓': 'Move down ↓', 'מחיקת השורה': 'Delete row', 'מחיקת הקו': 'Delete line', 'בלי רקע': 'No background', 'רקע לשורה': 'Row background', 'רקע לתא': 'Cell background', 'ערכת צבעים': 'Colour set',
    '⇥ ימין': '⇥ Right', '↔ מרכז': '↔ Centre', '⇤ שמאל': '⇤ Left', 'יישור לימין': 'Align right', 'יישור למרכז': 'Align centre', 'יישור לשמאל': 'Align left', 'להחזיר': 'Bring back', 'בטוח? לחצו שוב לשחזור': 'Sure? Click again to restore',
    'טקסט חדש': 'New text', 'שקף טקסט': 'Text slide', 'שקף תמונה': 'Image slide', 'תמונה בשקף': 'Image on slide', 'התמונה ממלאת את השקף': 'Image fills the slide', 'כל התמונה בשקף': 'Whole image on the slide',
    'התמונה נוספה. גוררים כדי להזיז, והעיגול הכחול משנה את הגודל.': 'Image added. Drag to move; the blue circle resizes it.', 'התמונה נמחקה': 'Image deleted', 'התיאור נשמר': 'Description saved', 'התמונה בלי תיאור': 'Image without description', 'נוסף שקף עם התמונה': 'A slide with the image was added',
    'לא הצלחנו לקרוא את התמונה. נסו קובץ JPG או PNG.': 'Could not read the image. Try a JPG or PNG file.', 'תיאור התמונה (לקוראי מסך)': 'Image description (for screen readers)', 'רשות. בלי תיאור — קוראי מסך ידלגו על התמונה.': 'Optional. Without a description, screen readers skip the image.',
    'למשל: מפת השינוי בתחנה המרכזית': 'e.g. Map of the change at the central station', 'כאן תופיע המצגת: מה משתנה, מפה של המסלול הישן והחדש, התחנות שמבוטלות והתחנות החדשות, ושקף סיום.': 'The slides will appear here: what changes, a map of the old and new route, the cancelled and new stops, and a closing slide.',
    'טוען את המצגת…': 'Loading the slides…', 'לא הצלחנו לטעון את המצגת. נסו לרענן את הדף.': 'Could not load the slides. Try reloading the page.',
    'האם זו אותה נסיעה שהשתנתה?': 'Is this the same trip that changed?', 'כן — להציג כשינוי מסלול': 'Yes — show as a route change', 'לפני ואחרי: מפה, תחנות שבוטלו ונוספו': 'Before and after: map, cancelled and added stops',
    'לא — להציג בנפרד': 'No — show separately', 'חלופה שבוטלה וחלופה חדשה': 'A cancelled variant and a new variant', 'החלופה שהפסיקה': 'The variant that stopped', 'החלופה שהתחילה': 'The variant that started',
    // לוח באנגלית — שמות בלי תרגום
    'אפשר לכתוב כאן את השם באנגלית (לא חובה).': 'You can type the English name here (optional).', 'כל השמות מתורגמים.': 'All names are translated.', 'שם אחד בלי תרגום לאנגלית — יופיע בעברית.': 'One name has no English translation — it will appear in Hebrew.',
    'להמשיך — השמות יופיעו בעברית': 'Continue — the names will appear in Hebrew',
    'דרך אחרת ותחנות אחרות': 'Different route and stops', 'שינוי בתחנות': 'Stop changes', 'נוספו תחנות': 'Stops added', 'בוטלו תחנות': 'Stops cancelled',
    'הקו הוארך': 'Line extended', 'הקו קוצר': 'Line shortened', 'שינוי בתחנה הראשונה או האחרונה': 'Change at the first or last stop', 'הקו מבוטל': 'Line cancelled',
    'כותרת בכל עמוד': 'Title on every page', 'רוחב העמודה — לגרור': 'Column width — drag',
    'אין מספיק מקום בדפדפן לשמור את התמונה — היא תישאר רק עד שהלשונית תיסגר.': 'Not enough browser storage to keep the image — it will stay only until the tab is closed.',
    'לא הצלחנו לשמור את התמונה בדפדפן — היא תישאר רק עד שהלשונית תיסגר.': 'Could not save the image in the browser — it will stay only until the tab is closed.',
    'לפני השינוי': 'Before the change', 'אחרי השינוי': 'After the change', 'מה השתנה': 'What changed',
    // חלקים משותפים לאתר (a11y.js, home-link.js, version.js) — רק בדף הזה, כשהממשק באנגלית
    'נגישות': 'Accessibility', 'טקסט גדול': 'Large text', 'טקסט גדול מאוד': 'Extra large text', 'ניגודיות גבוהה': 'High contrast', 'גווני אפור': 'Greyscale',
    'הדגשת קישורים': 'Highlight links', 'גופן קריא': 'Readable font', 'סמן עכבר גדול': 'Large cursor', 'עצירת אנימציות': 'Stop animations', 'איפוס כל ההגדרות': 'Reset all settings',
    'הצהרת נגישות ←': 'Accessibility statement →', 'תנאי שימוש ופרטיות ←': 'Terms of use and privacy →', 'זכויות יוצרים ←': 'Copyright →', 'קישורים ←': 'Links →',
    'הצהרת נגישות': 'Accessibility statement', 'תנאי שימוש ופרטיות': 'Terms of use and privacy', 'זכויות יוצרים': 'Copyright', 'קישורים': 'Links',
    '← חזרה לקו הבוחן': '← Back to HaKav HaBochen', 'חזרה לעמוד הראשי של הקו הבוחן': 'Back to the HaKav HaBochen home page',
    '© 2026 שלמה הרטמן · נבנה בעזרת בינה מלאכותית לפי הנחיותיו · מותר לצטט ולקשר בציון המקור ·': '© 2026 Shlomo Hartman · Built with AI following his instructions · You may quote and link with attribution ·',
    'זכויות יוצרים ותנאי שימוש': 'Copyright and terms of use',
    // תחתית
    '· הקו הבוחן': '· HaKav HaBochen', 'שינויים קרובים מזוהים כל לילה מנתוני משרד התחבורה': 'Upcoming changes are detected every night from Ministry of Transport data',
    ', ושינויים שהתחילו בשבועיים האחרונים — מהנתונים של הלילות הקודמים ומהארכיון של הקו הבוחן. זה לא פרסום רשמי.': ', and changes that started in the last two weeks — from previous nights and the HaKav HaBochen archive. This is not an official publication.'
  };
  /* טקסטים עם מספרים ותאריכים */
  var DOWS = { 'א׳': 'Sun', 'ב׳': 'Mon', 'ג׳': 'Tue', 'ד׳': 'Wed', 'ה׳': 'Thu', 'ו׳': 'Fri', 'ש׳': 'Sat', 'שבת': 'Sat', 'שישי': 'Fri' };
  var THEME = { 'לפי הטלפון': 'like the phone', 'בהיר': 'light', 'כהה': 'dark' };
  var CHIP = { ', הלוח לפי התאריך הזה': ', the board uses this date', ', לא בלוח': ', not on the board', ', השעות שונות': ', times differ' };
  var TTW = { 'יותר נסיעות': 'More trips', 'פחות נסיעות': 'Fewer trips', 'שעות אחרות': 'Different times', 'נסיעות חדשות': 'New trips', 'בלי נסיעות': 'No trips' };
  var DFULL = { 'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday', 'רביעי': 'Wednesday', 'חמישי': 'Thursday' };
  function ttSum(x) {
    var m = /^(יותר נסיעות|פחות נסיעות|שעות אחרות|נסיעות חדשות|בלי נסיעות) (.+)$/.exec(x); if (!m) return x;
    var d = m[2], dd = d === 'בימי חול' ? 'on weekdays' : d === 'בשישי' ? 'on Friday' : d === 'בשבת' ? 'on Saturday'
      : /^ביום /.test(d) ? 'on ' + (DFULL[d.slice(5)] || d.slice(5))
      : 'on ' + d.replace(/^בימים /, '').replace(/ ו-/g, ' and ').replace(/[א-ת]׳/g, function (w) { return DOWS[w] || w; });
    return (TTW[m[1]] || m[1]) + ' ' + dd;
  }
  function low(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  function lines(t) { return t.replace(/^קו /, 'Line ').replace(/^קווים /, 'Lines ').replace(/ ועוד$/, ' and more').replace(/ ו-?(\S+)$/, ' and $1'); }
  var UIP = [
    [/^טוען (\d+) קווים…$/, 'Loading $1 lines…'], [/^(\d+) קווים$/, '$1 lines'], [/^(\d+) שקפים$/, '$1 slides'], [/^(\d+) עמודים$/, '$1 pages'], [/^(\d+) תמונות$/, '$1 images'],
    [/^\((\d+) מתוך (\d+)\)$/, '($1 of $2)'], [/^בעוד (\d+) ימים$/, 'In $1 days'], [/^לפני (\d+) ימים$/, '$1 days ago'],
    [/^יום (\S+) (\d+\.\d+(?:\.\d+)?)$/, function (m, d, t) { return (DOWS[d] || d) + ' ' + t; }], [/^יום (\S+)$/, function (m, d) { return DOWS[d] ? DOWS[d] : m; }],
    [/^(\d+) קווים עוצרים כאן$/, '$1 lines stop here'], [/^(\d+) קווים משתנים$/, '$1 lines change'], [/^\+ כל (\d+) הקווים ללוח אחד$/, '+ All $1 lines in one board'],
    [/^(\d+) תחנות מבוטלות$/, '$1 stops cancelled'], [/^(\d+) תחנות חדשות$/, '$1 new stops'], [/^(\d+) תחנות עוברות מקום$/, '$1 stops are relocated'],
    [/^(\d+) שמות בלי תרגום לאנגלית — יופיעו בעברית\.$/, '$1 names have no English translation and will appear in Hebrew.'],
    [/^יש הצעות לימים מיוחדים \((\d+)\)$/, 'Suggestions for special days ($1)'], [/^להוציא את קו (\S+) מהמצגת$/, 'Remove line $1 from the slides'], [/^להעביר את (?:קו )?(.+) למעלה$/, function (m, x) { return 'Move ' + (UI[x] || x) + ' up'; }], [/^להעביר את (?:קו )?(.+) למטה$/, function (m, x) { return 'Move ' + (UI[x] || x) + ' down'; }], [/^קו (\S+)$/, 'Line $1'],
    [/^להקדים את העמודה (.+)$/, function (m, x) { return 'Move the ' + (UI[x] || x) + ' column earlier'; }], [/^לאחר את העמודה (.+)$/, function (m, x) { return 'Move the ' + (UI[x] || x) + ' column later'; }],
    [/^השם באנגלית: (.+)$/, 'English name: $1'], [/^עמודה נפרדת ל-(.+)$/, 'Separate column for $1'],
    [/^השלט ארוך — (\d+) עמודים\.$/, 'The sign is long — $1 pages.'], [/^לגרסה המקוצרת \((\d+) עמודים\)$/, 'Short version ($1 pages)'], [/^להציג את כל (\d+) העמודים$/, 'Show all $1 pages'],
    [/^גם באותיות הקטנות ביותר שעוד אפשר לקרוא, הלוח לא נכנס — צריך לפחות (\d+) עמודים\.$/, 'Even at the smallest readable size the board does not fit — it needs at least $1 pages.'],
    [/^חנוכה: (.+)$/, function (m, r) { return 'Hanukkah: ' + r.replace(/מוצ״ש/g, 'Saturday night').replace(/ ו-/g, ' and ').replace(/ בעמודות נפרדות$/, ' in separate columns').replace(/ בעמודה נפרדת$/, ' in a separate column'); }],
    [/^(.+) (\d+\.\d+): עמודה נפרדת$/, '$1 $2: separate column'],
    [/^(\S+ \S+) (\d+\.\d+) — לו״ז חריג \(שונה מ-(\d+\.\d+)\): להוציא מהלוח\?$/, function (m, d, a, b) { return (DOWS[d.replace(/^יום /, '')] || d) + ' ' + a + ' — unusual timetable (differs from ' + b + '): leave it out of the board?'; }],
    [/^יום (\S+) (\d+\.\d+)((?:, [^,]+)*)$/, function (m, d, t, r) { return (DOWS[d] || d) + ' ' + t + r.replace(/, [^,]+/g, function (x) { return CHIP[x] || x; }); }],
    [/^ועוד (\d+) ▾$/, '$1 more ▾'], [/^ועוד (\d+)$/, '$1 more'],
    [/^(עד |החל מ-)(\d+\.\d+) · (.+)$/, function (m, a, d, r) { return (a === 'עד ' ? 'Until ' : 'From ') + d + ' · ' + (tr(r) || r).trim(); }],
    [/^לוח לפי יעד(?: \((\d+)\/(\d+)\))?$/, function (m, a, b) { return 'Board' + (a ? ' (' + a + '/' + b + ')' : ''); }],
    [/^לו״ז עדכני · (.+)$/, function (m, r) { return 'Current timetable · ' + lines(r); }], [/^לו״ז משולב · (.+)$/, 'Combined timetable · $1'],
    [/^(.+) · (\d+) קווים לאותו יעד, בטבלה אחת$/, '$1 · $2 lines to the same destination, in one table'],
    [/^מ-(\d+\.\d+(?:\.\d+)?)$/, 'from $1'], [/^עד (\d+\.\d+(?:\.\d+)?)$/, 'until $1'], [/^רחוב (.+)$/, 'Street $1'], [/^שכונת (.+)$/, 'Neighbourhood $1'],
    [/^המצגת שלך: (.+)$/, 'Your slides: $1'],
    // תגיות בתוצאות (tagOf / badge ב-app.js) וכרטיסי "איזה שינוי?"
    // שינוי בלו"ז — הסיכום מהבונה (kind_summary): "יותר נסיעות בימים א׳–ד׳ ו-ו׳–ש׳, פחות נסיעות ביום חמישי"
    [/^(?:(?:יותר נסיעות|פחות נסיעות|שעות אחרות|נסיעות חדשות|בלי נסיעות) (?:בימי חול|בשישי|בשבת|ביום \S+|בימים [^,]+)(?:, |$))+$/, function (m) { return m.split(', ').map(function (x, i) { var t = ttSum(x); return i ? low(t) : t; }).join('; '); }],
    [/^משתנה מ-(\d+\.\d+)$/, 'Changes from $1'], [/^השתנה ב-(\d+\.\d+)$/, 'Changed on $1'], [/^קו חדש מ-(\d+\.\d+)$/, 'New line from $1'],
    [/^נוסע עד (\d+\.\d+)$/, 'Runs until $1'], [/^בוטל ב-(\d+\.\d+)$/, 'Cancelled on $1'], [/^לו״ז חדש מ-(\d+\.\d+)$/, 'New timetable from $1'],
    [/^לו״ז השתנה ב-(\d+\.\d+)$/, 'Timetable changed on $1'], [/^חלופה מתבטלת מ-(\d+\.\d+)$/, 'Variant cancelled from $1'],
    [/^חלופה בוטלה ב-(\d+\.\d+)$/, 'Variant cancelled on $1'], [/^חלופה חדשה מ-(\d+\.\d+)$/, 'New variant from $1'],
    [/^(\d+) משתנים$/, '$1 changing'], [/^(\d+) תחנות מבוטלות$/, '$1 stops cancelled'],
    [/^אותו שינוי ב-(\d+) קווים(?: · (.+))?$/, function (m, n, r) { return 'Same change on ' + n + ' lines' + (r ? ' · ' + r.split(' · ').map(function (x) { return (tr(x) || x).trim(); }).join(' · ') : ''); }],
    [/^· (.+) \(מתוך (\d+) שעוצרים כאן\)$/, function (m, a, n) { return '· ' + (tr(a) || a).trim() + ' (of ' + n + ' that stop here)'; }],
    [/^(.+) \((\d+) ועוד (\d+)\)$/, '$1 ($2 and $3 more)'], [/^(.+) \(ועוד (\d+)\)$/, '$1 ($2 more)'],
    [/^(.+) — בשבועיים הקרובים או בשבועיים האחרונים \((\d+)\)$/, function (m, a, n) { return (UI[a.replace(/^קווים/, 'הקווים')] || a) + ' — in the next two weeks or the last two weeks (' + n + ')'; }],
    [/^קווים שהשתנו בשבועיים האחרונים \((\d+)\)$/, 'Lines that changed in the last two weeks ($1)'],
    [/^(\d+) (קווים עם שינוי מסלול|קווים החדשים|קווים שמבוטלים|קווים עם שינוי בלו״ז|קווים עם שינוי שכבר התחיל)$/, function (m, n, a) { return n + ' ' + low(UI['ה' + a]); }],
    [/^\+ כל (\d+) (הקווים למצגת אחת|הקווים עם שינוי מסלול|הקווים החדשים|הקווים שמבוטלים|הקווים עם שינוי בלו״ז|הקווים עם שינוי שכבר התחיל)$/, function (m, n, a) { return '+ All ' + n + ' ' + low(UI[a]); }],
    [/^תאורה: (\S+(?: \S+)?) \(לחיצה: (\S+(?: \S+)?)\)$/, function (m, a, b) { return 'Theme: ' + (THEME[a] || a) + ' (click: ' + (THEME[b] || b) + ')'; }], [/^תאורה: (.+)$/, function (m, a) { return 'Theme: ' + (THEME[a] || a); }],
    [/^אין כאן (.+)\. אפשר לבחור "הכול"\.$/, function (m, a) { return 'No ' + (UI[a.replace(/^קווים/, 'הקווים')] || a).replace(/^Lines/, 'lines') + ' here. You can choose "All".'; }],
    [/^תמונה בשקף(: .+)?\. חיצים להזזה, פלוס ומינוס לשינוי גודל, Delete למחיקה$/, function (m, a) { return 'Image on slide' + (a || '') + '. Arrows move it, plus and minus resize, Delete removes it'; }],
    [/^שבת (\d+\.\d+) — לו״ז חריג \(שונה מ-(\d+\.\d+)\): להוציא מהלוח\?$/, 'Sat $1 — unusual timetable (differs from $2): leave it out of the board?'],
    [/^שישי (\d+\.\d+) — לו״ז חריג \(שונה מ-(\d+\.\d+)\): להוציא מהלוח\?$/, 'Fri $1 — unusual timetable (differs from $2): leave it out of the board?']
  ];
  /* שם הקובץ להורדה (ברירת המחדל): המילים הקבועות באנגלית; שמות (ערים, יעדים) — כמו שהם */
  var FILE = [['שלט-להדפסה-', 'sign-'], ['סטטוס-', 'status-'], ['לוח-זמנים-', 'timetable-'], ['לוח-מודעות-קו-', 'board-line-'], ['לו״ז-חדש-קו-', 'new-timetable-line-'],
    ['לו״ז-עדכני', 'timetable'], ['שינויים-בקווים-', 'changes-lines-'], ['שינוי-בקו-', 'change-line-'], ['אותו-שינוי-ב-', 'same-change-'], ['קווים-', 'lines-'], ['קו-', 'line-'],
    ['-ועוד', '-and-more'], ['-מ-', '-from-'], ['-ו-', '-and-']];
  function file(n) { var s = String(n); FILE.forEach(function (f) { s = s.split(f[0]).join(f[1]); }); return s; }
  var KEY = 'lc-lang', lang = 'he';
  try {
    var q = (/[?&]lang=(en|he)\b/.exec(location.search) || [])[1];
    if (q) { lang = q; localStorage.setItem(KEY, q); if (q === 'en' && !localStorage.getItem('lc-blang-auto')) localStorage.setItem('lc-blang-auto', 'en'); } else lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'he';
  } catch (e) { /* בלי אחסון — עברית */ }
  function tr(s) {
    var t = String(s), k = t.trim().replace(/\s+/g, ' ');
    if (!k || !/[א-ת→←]/.test(k)) return null;
    if (Object.prototype.hasOwnProperty.call(UI, k)) return t.replace(t.trim(), UI[k]);
    for (var i = 0; i < UIP.length; i++) if (UIP[i][0].test(k)) return t.replace(t.trim(), k.replace(UIP[i][0], UIP[i][1]));
    // כמה חלקים עם " · " ביניהם (למשל בכרטיס "איזה שינוי?": סוג השינוי · הלוך וחזור · מהארכיון) — כל חלק בנפרד, רק כשלכולם יש תרגום
    if (k.indexOf(' · ') > 0) {
      var ps = k.split(' · '), ok = true;
      ps = ps.map(function (x) { if (!/[א-ת]/.test(x)) return x; var y = tr(x); if (y == null) ok = false; return y == null ? x : y.trim(); });
      if (ok) return t.replace(t.trim(), ps.join(' · '));
    }
    return null;
  }
  var SKIP = '.sframe,script,style,[data-noi18n],.ennote li span,.res .badge,.badge';
  // בתוך שקף — רק כפתורי העריכה (noprint: "תיאור", "להחזיר"…), לא הטקסט של השקף עצמו (שפת הלוח)
  function skip(el) { if (!el || !el.closest) return !el; var k = el.closest(SKIP); return !!k && !(k.classList && k.classList.contains('sframe') && el.closest('.noprint')); }
  var ATTR = ['placeholder', 'aria-label', 'title', 'alt'];
  /* מה שכבר תורגם (צומת טקסט / תכונה → הערך שכתבנו): לא מתרגמים שוב את התוצאה. בלי זה, תרגום שהוא גם מפתח
     ('→' ↔ '←') מתהפך בלי סוף — כל שינוי מעורר את ה-MutationObserver שוב, והדף נתקע */
  var DONE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function text(x) {
    if (skip(x.parentElement) || (DONE && DONE.get(x) === x.nodeValue)) return;
    var t = tr(x.nodeValue);
    if (t != null && t !== x.nodeValue) { x.nodeValue = t; if (DONE) DONE.set(x, t); }
  }
  function attr(el, a) {
    var v = el.getAttribute(a), d = DONE && DONE.get(el);
    if (!v || (d && d[a] === v)) return;
    var t = tr(v);
    if (t != null && t !== v) { el.setAttribute(a, t); if (DONE) { if (!d) DONE.set(el, (d = {})); d[a] = t; } }
  }
  function run(root) {
    if (!root) return;
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1 || skip(root)) return;
    var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('[placeholder],[aria-label],[title],[alt]')));
    els.forEach(function (el) { if (skip(el)) return; ATTR.forEach(function (a) { attr(el, a); }); });
    var w = document.createTreeWalker(root, 4, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(text);
  }
  function start() {
    run(document.body);
    if (document.title) { var tt = tr(document.title); if (tt) document.title = tt; }
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'characterData') run(m.target);
        else if (m.type === 'attributes') run(m.target);
        else m.addedNodes.forEach(run);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  }
  function set(l) {
    try { localStorage.setItem(KEY, l); if (l === 'en' && !localStorage.getItem('lc-blang-auto')) localStorage.setItem('lc-blang-auto', 'en'); } catch (e) { /* בלי אחסון */ }
    var u = new URL(location.href); u.searchParams.set('lang', l); location.replace(u.toString());
  }
  g.LCUI = { UI: UI, UIP: UIP, tr: tr, file: file, lang: lang, en: lang === 'en', set: set };
  if (typeof document === 'undefined') return;
  if (lang === 'en') {
    // data-kb-lang — סימן לחלקים המשותפים לאתר (version.js) שהדף הזה באנגלית; בכל שאר הדפים הם כמו קודם
    document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; document.documentElement.setAttribute('data-kb-lang', 'en');
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})(typeof window !== 'undefined' ? window : this);
