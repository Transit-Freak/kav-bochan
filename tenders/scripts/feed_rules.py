# -*- coding: utf-8 -*-
"""סיווג פרסום מהפורטל לפי הכותרת, בחוקים קבועים (בלי מודל שפה).

operating_tender   מכרז להפעלת קווי שירות (אוטובוסים / מוניות שירות)
transport_related  פרסום בתחום התחבורה הציבורית שאינו מכרז הפעלה (בקרה על מפעילים, סככות, אבטחה…)
unrelated          פרסום של משרד התחבורה שאינו תחבורה ציבורית (רישיונות תוכנה, רישיונות נהיגה, הדפסה…)
"""
import re

OPERATING = re.compile(r'קבלת ר[יש]+ונות|להפעלת קווי|הפעלת קווי שירות|הפעלת אשכול|להפעלת אוטובוסים|להפעלת מוניות')
NOT_OPERATING = ('קול קורא', 'אבטחה', 'בקרה', 'התייחסות הציבור')
TRANSPORT = re.compile(r'קווי שירות|קו שירות|אוטובוס|מוניות|תחבורה ציבורית|תח"צ|תחצ|סככות|תחנות|מסופ|רכבת|מטרו|נת"צ|נוסעים|מפעילי|קווי מתע"ן|מתען|רב[- ]קו|כרטוס|הסעות')
# תוכנה, רישוי תוכנה, רישיונות נהיגה, הדפסה — גם כשהכותרת מזכירה "תחבורה ציבורית"
UNRELATED = re.compile(r'מיקרוסופט|microsoft|ichain|datapower|db2|\bwas\b|arcgis|\bgis\b|eternal|firewall|תוכנ|תחזוקת רישיונות|תחזוקה לרישיונות|חידוש רישיונות|רישיון נהיגה|רישיונות נהיגה|משיט|הדפסה|מגנוט|דיוור|תחנות צילום|בסיסי נתונים|ריהוט|ניקיון|מזגנים|כלי רכב לעובדי|רכבי ליסינג', re.I)


def classify(title):
    t = title or ''
    if OPERATING.search(t) and not any(x in t for x in NOT_OPERATING):
        return 'operating_tender'
    if UNRELATED.search(t):
        return 'unrelated'
    if TRANSPORT.search(t):
        return 'transport_related'
    return 'unrelated'
