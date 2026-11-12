// Auto-synced catalog & offline fallback from kpssasistani.com live database
export interface SeedTopicMeta {
  docId: string;
  id: string;
  name: string;
  questionCount: number;
}

export interface SeedQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  courseId: string;
  topicDocId: string;
  topicName: string;
}

export const INITIAL_TOPIC_CATALOG: Record<string, SeedTopicMeta[]> = {
  "tarih": [
    {
      "docId": "t_islamiyet_oncesi",
      "id": "t_islamiyet_oncesi",
      "name": "1. İslamiyet Öncesi Türk Tarihi",
      "questionCount": 161
    },
    {
      "docId": "t_turk_islam",
      "id": "t_turk_islam",
      "name": "2. İlk Türk - İslam Devletleri ve Beylikleri",
      "questionCount": 698
    },
    {
      "docId": "manual_topic_1770634494878_0",
      "id": "manual_topic_1770634494878_0",
      "name": "2a. Haçlı Seferleri - Yakın Doğu Asya Anadolu Devletleri",
      "questionCount": 98
    },
    {
      "docId": "manual_topic_1770460759555_0",
      "id": "manual_topic_1770460759555_0",
      "name": "2b.İlk Türk - İslam Devletleri ve Beylikleri Kültür ve Medeniyet",
      "questionCount": 884
    },
    {
      "docId": "topic_1773578227620_9441",
      "id": "topic_1773578227620_9441",
      "name": "3a. Osmanlı Kuruluş - 1",
      "questionCount": 297
    },
    {
      "docId": "topic_1773578227991_9671",
      "id": "topic_1773578227991_9671",
      "name": "3b. Osmanlı Kuruluş - 2",
      "questionCount": 377
    },
    {
      "docId": "t_osmanli_kultur",
      "id": "t_osmanli_kultur",
      "name": "4. Osmanlı Devleti’nde Kültür ve Uygarlık",
      "questionCount": 0
    },
    {
      "docId": "t_osmanli_duraklama",
      "id": "t_osmanli_duraklama",
      "name": "5a. XVII. Yüzyılda Osmanlı Devleti",
      "questionCount": 349
    },
    {
      "docId": "t_osmanli_gerileme",
      "id": "t_osmanli_gerileme",
      "name": "6. XVIII. Yüzyılda Osmanlı Devleti",
      "questionCount": 194
    },
    {
      "docId": "t_osmanli_dagilma",
      "id": "t_osmanli_dagilma",
      "name": "7. XIX. Yüzyılda Osmanlı Devleti",
      "questionCount": 1030
    },
    {
      "docId": "t_osmanli_xx",
      "id": "t_osmanli_xx",
      "name": "8. XX. Yüzyılda Osmanlı Devleti",
      "questionCount": 0
    },
    {
      "docId": "t_kurtulus_hazirlik",
      "id": "t_kurtulus_hazirlik",
      "name": "9. Kurtuluş Savaşı Hazırlık Dönemi",
      "questionCount": 0
    },
    {
      "docId": "t_tbmm_donemi",
      "id": "t_tbmm_donemi",
      "name": "10. I. TBMM Dönemi",
      "questionCount": 0
    },
    {
      "docId": "t_kurtulus_muharebeler",
      "id": "t_kurtulus_muharebeler",
      "name": "11. Kurtuluş Savaşı Muharebeler Dönemi",
      "questionCount": 0
    },
    {
      "docId": "t_ataturk_inkilaplari",
      "id": "t_ataturk_inkilaplari",
      "name": "12. Atatürk İnkılapları",
      "questionCount": 0
    },
    {
      "docId": "t_ataturk_ilkeleri",
      "id": "t_ataturk_ilkeleri",
      "name": "13. Atatürk İlkeleri",
      "questionCount": 0
    },
    {
      "docId": "t_ic_politika",
      "id": "t_ic_politika",
      "name": "14. Partiler ve Partileşme Dönemi",
      "questionCount": 0
    },
    {
      "docId": "t_dis_politika",
      "id": "t_dis_politika",
      "name": "15. Atatürk Dönemi Türk Dış Politikası",
      "questionCount": 0
    },
    {
      "docId": "t_ataturk_sonrasi",
      "id": "t_ataturk_sonrasi",
      "name": "16. Atatürk Sonrası Dönem",
      "questionCount": 0
    },
    {
      "docId": "t_ataturk_hayati",
      "id": "t_ataturk_hayati",
      "name": "17. Atatürk’ün Hayatı ve Kişiliği",
      "questionCount": 0
    }
  ],
  "turkce": [
    {
      "docId": "topic_1773972339100_6854",
      "id": "topic_1773972339100_6854",
      "name": "1. Kök Bilgisi - Yapı Bilgisi",
      "questionCount": 200
    },
    {
      "docId": "topic_1773972339393_3309",
      "id": "topic_1773972339393_3309",
      "name": "2. Yapım Ekleri - Yapı Bilgisi",
      "questionCount": 368
    },
    {
      "docId": "topic_1773972339517_7563",
      "id": "topic_1773972339517_7563",
      "name": "3. Çekim Ekleri - Yapı Bilgisi",
      "questionCount": 404
    },
    {
      "docId": "topic_1773972339633_8218",
      "id": "topic_1773972339633_8218",
      "name": "4. Yapısına Göre Sözcükler - Yapı Bilgisi",
      "questionCount": 228
    },
    {
      "docId": "topic_1773972339746_5896",
      "id": "topic_1773972339746_5896",
      "name": "5. Ses Bilgisi",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972339862_8445",
      "id": "topic_1773972339862_8445",
      "name": "6. Ses Bilgisi Etkinlik",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972339954_5591",
      "id": "topic_1773972339954_5591",
      "name": "7. İsim (Ad) - Sözcük Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340065_2835",
      "id": "topic_1773972340065_2835",
      "name": "8. Sıfat (Ön Ad) - Sözcük Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340169_5125",
      "id": "topic_1773972340169_5125",
      "name": "9. Zamir (Adıl) - Sözcük Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340260_6055",
      "id": "topic_1773972340260_6055",
      "name": "10. Tamlamalar - Sözcük Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340369_3240",
      "id": "topic_1773972340369_3240",
      "name": "11. Zarf (Belirteç) - Sözcük Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340470_9525",
      "id": "topic_1773972340470_9525",
      "name": "12. Edat - Bağlaç - Ünlem - Sözcük Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340588_6427",
      "id": "topic_1773972340588_6427",
      "name": "13. Sözcük Türleri - İsim Soylu Sözcükler - Etkinlik",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340693_3830",
      "id": "topic_1773972340693_3830",
      "name": "14. Fiil (Eylem)",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340800_9282",
      "id": "topic_1773972340800_9282",
      "name": "15. Zamanlarına Göre Fiiller - Ek-Fiil",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972340920_9740",
      "id": "topic_1773972340920_9740",
      "name": "16. Fiilimsi (Eylemsi)",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341032_6318",
      "id": "topic_1773972341032_6318",
      "name": "17. Yapısına Göre Fiiller",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341125_4737",
      "id": "topic_1773972341125_4737",
      "name": "18. Söz Öbekleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341217_59",
      "id": "topic_1773972341217_59",
      "name": "19. Cümlenin Ögeleri I",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341326_1215",
      "id": "topic_1773972341326_1215",
      "name": "20. Cümlenin Ögeleri II",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341443_8626",
      "id": "topic_1773972341443_8626",
      "name": "21. Cümle Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341549_1933",
      "id": "topic_1773972341549_1933",
      "name": "22. Fiilde Çatı",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341636_4156",
      "id": "topic_1773972341636_4156",
      "name": "23. Yazım Kuralları - ÖSYM Nasıl Sormuş",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341723_8084",
      "id": "topic_1773972341723_8084",
      "name": "24. Yazım Kuralları I",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341827_7887",
      "id": "topic_1773972341827_7887",
      "name": "25. Yazım Kuralları - Etkinlik Çözümleme - 1-2-3-4-5",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972341933_9428",
      "id": "topic_1773972341933_9428",
      "name": "26. Yazım Kuralları II - Büyük Harflerin Kullanımı",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342049_399",
      "id": "topic_1773972342049_399",
      "name": "27. Yazım Kuralları - Büyük Harflerin Kullanımı - Etkinlik",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342152_7669",
      "id": "topic_1773972342152_7669",
      "name": "28. Yazım Kuralları III - Birleşik Sözcüklerin Yazılışı",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342264_3572",
      "id": "topic_1773972342264_3572",
      "name": "29. Noktalama İşaretleri I",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342372_5611",
      "id": "topic_1773972342372_5611",
      "name": "30. Noktalama İşaretleri II",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342471_1251",
      "id": "topic_1773972342471_1251",
      "name": "31. Noktalama İşaretleri - Etkinlik",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342563_8902",
      "id": "topic_1773972342563_8902",
      "name": "32. Anlamdan Kaynaklanan Anlatım Bozuklukları",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342668_7661",
      "id": "topic_1773972342668_7661",
      "name": "33. Dil Bilgisinden Kaynaklanan Anlatım Bozuklukları",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342773_2340",
      "id": "topic_1773972342773_2340",
      "name": "34. Sözcüğün Anlam Özellikleri I",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342864_4351",
      "id": "topic_1773972342864_4351",
      "name": "35. Sözcüğün Anlam Özellikleri II",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972342968_4685",
      "id": "topic_1773972342968_4685",
      "name": "36. Sözcükler Arası Anlam İlişkileri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343073_7578",
      "id": "topic_1773972343073_7578",
      "name": "37. Mecaz Yolları",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343185_6719",
      "id": "topic_1773972343185_6719",
      "name": "38. İkileme - Deyim - Atasözleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343289_2836",
      "id": "topic_1773972343289_2836",
      "name": "39. Altı Çizili Söz",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343376_8850",
      "id": "topic_1773972343376_8850",
      "name": "40. Cümle Tamamlama",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343465_419",
      "id": "topic_1773972343465_419",
      "name": "41. Cümle Yorumu",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343559_5882",
      "id": "topic_1773972343559_5882",
      "name": "42. İki Cümle Analizi",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343664_3680",
      "id": "topic_1773972343664_3680",
      "name": "43. Cümle Birleştirme",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343765_2897",
      "id": "topic_1773972343765_2897",
      "name": "44. Anlamlarına Göre Cümleler",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343852_1347",
      "id": "topic_1773972343852_1347",
      "name": "45. Anlam İlişkilerine Göre Cümleler",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972343940_9628",
      "id": "topic_1773972343940_9628",
      "name": "46. Kanıtlanabilirlik Açısından Cümleler",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344032_468",
      "id": "topic_1773972344032_468",
      "name": "47. Cümlede Kavramlar",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344131_5525",
      "id": "topic_1773972344131_5525",
      "name": "48. Cümle Oluşturma",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344218_3787",
      "id": "topic_1773972344218_3787",
      "name": "49. Cümlede Anlam - Etkinlik",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344315_3388",
      "id": "topic_1773972344315_3388",
      "name": "50. Anlatım Özellikleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344410_4410",
      "id": "topic_1773972344410_4410",
      "name": "51. Anlatım Biçimleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344500_6109",
      "id": "topic_1773972344500_6109",
      "name": "52. Düşünceyi Geliştirme Yolları I",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344587_4091",
      "id": "topic_1773972344587_4091",
      "name": "53. Düşünceyi Geliştirme Yolları II",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344675_4202",
      "id": "topic_1773972344675_4202",
      "name": "54. Paragrafta Boşluk Tamamlama",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344782_7125",
      "id": "topic_1773972344782_7125",
      "name": "55. Paragrafa Cümle Yerleştirme",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344887_3885",
      "id": "topic_1773972344887_3885",
      "name": "56. Paragraf Akışı Bozan Cümle",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972344975_8902",
      "id": "topic_1773972344975_8902",
      "name": "57. Paragrafı İkiye Bölme",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972345066_2727",
      "id": "topic_1773972345066_2727",
      "name": "58. Paragraf Yer Değiştirme",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972345157_9632",
      "id": "topic_1773972345157_9632",
      "name": "59. Paragraf Oluşturma",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972345244_1409",
      "id": "topic_1773972345244_1409",
      "name": "60. Paragraf Soru - Cevap",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972345333_4663",
      "id": "topic_1773972345333_4663",
      "name": "61. Paragraf Konu - Ana Düşünce",
      "questionCount": 0
    },
    {
      "docId": "topic_1773972345436_4081",
      "id": "topic_1773972345436_4081",
      "name": "62. Paragraf Yardımcı Düşünceler",
      "questionCount": 0
    }
  ],
  "cografya": [
    {
      "docId": "manual_topic_1769984168353_0",
      "id": "manual_topic_1769984168353_0",
      "name": "1. Türkiye'nin Coğrafi Konumu",
      "questionCount": 137
    },
    {
      "docId": "topic_1774123170801_5411",
      "id": "topic_1774123170801_5411",
      "name": "2. Türkiye’nin Yer Şekilleri - (İç ve Dış Kuvvet)",
      "questionCount": 253
    },
    {
      "docId": "topic_1774123189535_4181",
      "id": "topic_1774123189535_4181",
      "name": "3. Türkiye’nin Yer Şekilleri - (Jeolojik Zamanlar)",
      "questionCount": 225
    },
    {
      "docId": "manual_topic_1769984168353_2",
      "id": "manual_topic_1769984168353_2",
      "name": "4. Türkiye'nin Yer Şekilleri (Dağlar)",
      "questionCount": 246
    },
    {
      "docId": "manual_topic_1769984168353_4",
      "id": "manual_topic_1769984168353_4",
      "name": "5. Türkiye'nin Yer Şekilleri (Platolar)",
      "questionCount": 143
    },
    {
      "docId": "manual_topic_1769984168353_3",
      "id": "manual_topic_1769984168353_3",
      "name": "6. Türkiye'nin Yer Şekilleri (Ovalar)",
      "questionCount": 160
    },
    {
      "docId": "topic_1774124478281_7766",
      "id": "topic_1774124478281_7766",
      "name": "7. Türkiye'nin Yer Şekilleri - (Akarsu Şekilleri)",
      "questionCount": 149
    },
    {
      "docId": "topic_1774124478401_3433",
      "id": "topic_1774124478401_3433",
      "name": "8. Türkiye'nin Yer Şekilleri - (Rüzgar ve Buzullar)",
      "questionCount": 163
    },
    {
      "docId": "topic_1774124478523_1566",
      "id": "topic_1774124478523_1566",
      "name": "9. Türkiye'nin Yer Şekilleri - (Karstik Şekiller)",
      "questionCount": 132
    },
    {
      "docId": "topic_1774124478648_462",
      "id": "topic_1774124478648_462",
      "name": "10. Türkiye'nin Yer Şekilleri - (Kıyı Şekillenmesi)",
      "questionCount": 134
    },
    {
      "docId": "topic_1774124478775_1333",
      "id": "topic_1774124478775_1333",
      "name": "11. Türkiye'nin Yer Şekilleri - (Genel Özellikler)",
      "questionCount": 67
    },
    {
      "docId": "topic_1774124478883_7341",
      "id": "topic_1774124478883_7341",
      "name": "12. Türkiye İklimi - (Sıcaklık)",
      "questionCount": 136
    },
    {
      "docId": "topic_1774124478999_2594",
      "id": "topic_1774124478999_2594",
      "name": "13. Türkiye İklimi - (Basınç ve Rüzgar)",
      "questionCount": 170
    },
    {
      "docId": "topic_1774124479115_6889",
      "id": "topic_1774124479115_6889",
      "name": "14. Türkiye İklimi - (Nemlilik ve Yağış)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124479234_73",
      "id": "topic_1774124479234_73",
      "name": "15. Türkiye İklimi - (Mikroklimalar)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124479357_9168",
      "id": "topic_1774124479357_9168",
      "name": "16. Türkiye'nin Su, Toprak ve Bitki Varlığı - (Akarsular)",
      "questionCount": 224
    },
    {
      "docId": "topic_1774124479480_8064",
      "id": "topic_1774124479480_8064",
      "name": "17. Türkiye'nin Su, Toprak ve Bitki Varlığı - (Göller)",
      "questionCount": 168
    },
    {
      "docId": "topic_1774124479595_4430",
      "id": "topic_1774124479595_4430",
      "name": "18. Türkiye'nin Su, Toprak ve Bitki Varlığı - (Denizler)",
      "questionCount": 69
    },
    {
      "docId": "topic_1774124479719_8987",
      "id": "topic_1774124479719_8987",
      "name": "19. Türkiye'nin Su, Toprak ve Bitki Varlığı - (Yeraltı Suları)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124479847_3123",
      "id": "topic_1774124479847_3123",
      "name": "20. Türkiye'nin Su, Toprak ve Bitki Varlığı - (Topraklar)",
      "questionCount": 179
    },
    {
      "docId": "topic_1774124479985_6880",
      "id": "topic_1774124479985_6880",
      "name": "21. Türkiye'nin Su, Toprak ve Bitki Varlığı - (Bitki)",
      "questionCount": 218
    },
    {
      "docId": "topic_1774124480107_144",
      "id": "topic_1774124480107_144",
      "name": "22. Türkiye'de Çevre ve Doğal Afetler",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480226_9656",
      "id": "topic_1774124480226_9656",
      "name": "23. Türkiye'nin Beşeri Coğrafyası - (Nüfus)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480347_8704",
      "id": "topic_1774124480347_8704",
      "name": "24. Türkiye'nin Beşeri Coğrafyası - (Yerleşme)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480454_2356",
      "id": "topic_1774124480454_2356",
      "name": "25. Türkiye'nin Beşeri Coğrafyası - (Göçler)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480557_153",
      "id": "topic_1774124480557_153",
      "name": "26. Türkiye'nin Ekonomik Coğrafyası - (Ekonomi Politikaları)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480671_3449",
      "id": "topic_1774124480671_3449",
      "name": "27. Türkiye'nin Ekonomik Coğrafyası - (Tarım)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480771_4752",
      "id": "topic_1774124480771_4752",
      "name": "28. Türkiye'nin Ekonomik Coğrafyası - (Hayvancılık)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480883_8059",
      "id": "topic_1774124480883_8059",
      "name": "29. Türkiye'nin Ekonomik Coğrafyası - (Madenler)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124480983_5981",
      "id": "topic_1774124480983_5981",
      "name": "30. Türkiye'nin Ekonomik Coğrafyası - (Enerji Kaynakları)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124481098_4163",
      "id": "topic_1774124481098_4163",
      "name": "31. Türkiye'nin Ekonomik Coğrafyası - (Sanayi)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124481200_1249",
      "id": "topic_1774124481200_1249",
      "name": "32. Türkiye'nin Ekonomik Coğrafyası - (Sanayi ve Ticaret)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124481314_9916",
      "id": "topic_1774124481314_9916",
      "name": "33. Türkiye'nin Ekonomik Coğrafyası - (Ulaşım)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124481435_9972",
      "id": "topic_1774124481435_9972",
      "name": "34. Türkiye'nin Ekonomik Coğrafyası - (Turizm)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124481538_5873",
      "id": "topic_1774124481538_5873",
      "name": "35. Türkiye'de Bölge Kavramı ve Sistematiği - (Jeopolitik Bölge)",
      "questionCount": 0
    },
    {
      "docId": "topic_1774124481647_8738",
      "id": "topic_1774124481647_8738",
      "name": "36. Türkiye'de Bölge Kavramı ve Sistematiği - (Plan Bölgeler)",
      "questionCount": 0
    }
  ],
  "vatandaslik": [
    {
      "docId": "topic_1771197873729_1714",
      "id": "topic_1771197873729_1714",
      "name": "1. Sosyal Düzen Kuralları",
      "questionCount": 60
    },
    {
      "docId": "topic_1771197874005_7193",
      "id": "topic_1771197874005_7193",
      "name": "2. Hukuk Kurallarının Yaptırımları",
      "questionCount": 100
    },
    {
      "docId": "topic_1771197874123_8263",
      "id": "topic_1771197874123_8263",
      "name": "3. Hukukun Türleri ve Hukuk Kurallarının Çeşitleri",
      "questionCount": 97
    },
    {
      "docId": "topic_1771197874234_2292",
      "id": "topic_1771197874234_2292",
      "name": "4. Hukukun Kaynakları",
      "questionCount": 81
    },
    {
      "docId": "topic_1771197874352_5576",
      "id": "topic_1771197874352_5576",
      "name": "5. Hukukta Boşluk ve Türleri",
      "questionCount": 63
    },
    {
      "docId": "topic_1771197874464_6443",
      "id": "topic_1771197874464_6443",
      "name": "6. Hukukun Dalları",
      "questionCount": 194
    },
    {
      "docId": "topic_1771197874584_1215",
      "id": "topic_1771197874584_1215",
      "name": "7. Ceza Hukuku - 1",
      "questionCount": 57
    },
    {
      "docId": "topic_1771197874677_6865",
      "id": "topic_1771197874677_6865",
      "name": "8. Ceza Hukuku - 2",
      "questionCount": 118
    },
    {
      "docId": "topic_1771197874781_7044",
      "id": "topic_1771197874781_7044",
      "name": "9. Medeni Hukuk - 1 (Başlangıç Hükümleri)",
      "questionCount": 97
    },
    {
      "docId": "topic_1771197874901_8293",
      "id": "topic_1771197874901_8293",
      "name": "10. Medeni Hukuk - 2 (Kişilik Kavramı)",
      "questionCount": 52
    },
    {
      "docId": "topic_1771197875008_3221",
      "id": "topic_1771197875008_3221",
      "name": "11. Medeni Hukuk - 3 (Ehliyet Türleri - 1)",
      "questionCount": 105
    },
    {
      "docId": "topic_1771197875121_3523",
      "id": "topic_1771197875121_3523",
      "name": "12. Medeni Hukuk - 4 (Ehliyet Türleri - 2 / Sınıflandırma)",
      "questionCount": 104
    },
    {
      "docId": "topic_1771197875212_163",
      "id": "topic_1771197875212_163",
      "name": "13. Medeni Hukuk - 5 (Hısımlık)",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197875323_310",
      "id": "topic_1771197875323_310",
      "name": "14. Medeni Hukuk - 6 (Yerleşim Yeri ve Tüzel Kişiler)",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197875436_8735",
      "id": "topic_1771197875436_8735",
      "name": "15. Borçlar Hukuku",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197875547_7002",
      "id": "topic_1771197875547_7002",
      "name": "16. Devletler Özel Hukuku",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197875656_6514",
      "id": "topic_1771197875656_6514",
      "name": "17. Anayasa Hukukuna Giriş | Devlet Ve Şekilleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197875748_3500",
      "id": "topic_1771197875748_3500",
      "name": "18. Anayasa Hukukuna Giriş | Hükümet Sistemleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197875859_8503",
      "id": "topic_1771197875859_8503",
      "name": "19. Demokrasi Ve Türleri-Siyasi İktidar-Anayasa Türleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197875970_8816",
      "id": "topic_1771197875970_8816",
      "name": "20. Anayasa Hukukuna Giriş | Türk Anayasa Tarihi - 1",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876084_9699",
      "id": "topic_1771197876084_9699",
      "name": "21. Anayasa Hukukuna Giriş | Türk Anayasa Tarihi - 2",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876190_9050",
      "id": "topic_1771197876190_9050",
      "name": "22. 1982 Anayasası - Başlangıç ve Genel Esaslar",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876297_9085",
      "id": "topic_1771197876297_9085",
      "name": "23. Temel Hak ve Hürriyetler - 1",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876403_6971",
      "id": "topic_1771197876403_6971",
      "name": "24. Temel Hak ve Hürriyetler - 2",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876510_9308",
      "id": "topic_1771197876510_9308",
      "name": "25. Yasama - 1",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876616_7408",
      "id": "topic_1771197876616_7408",
      "name": "26. Yasama - 2",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876727_6029",
      "id": "topic_1771197876727_6029",
      "name": "27. Yasama - 3 | TBMM Seçimleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876817_667",
      "id": "topic_1771197876817_667",
      "name": "28. Yasama - 4 | Yasama Bağışıklığı ve Milletvekilliğinin Sona Ermesi",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197876925_8667",
      "id": "topic_1771197876925_8667",
      "name": "29. Yasama - 5 | Kanun Yapılış Süreci",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877030_6622",
      "id": "topic_1771197877030_6622",
      "name": "30. Yasama - 6 | TBMM'nin Toplanması Faaliyetleri",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877138_3728",
      "id": "topic_1771197877138_3728",
      "name": "31. Yasama - 7 | TBMM'nin Bilgi Edinme ve Denetleme Yolları",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877248_9078",
      "id": "topic_1771197877248_9078",
      "name": "32. Yürütme - 1",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877361_5840",
      "id": "topic_1771197877361_5840",
      "name": "33. Yürütme - 2",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877450_9248",
      "id": "topic_1771197877450_9248",
      "name": "34. Yargı - 1",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877543_966",
      "id": "topic_1771197877543_966",
      "name": "35. Yargı - 2",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877633_5511",
      "id": "topic_1771197877633_5511",
      "name": "36. Yargı - 3",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877739_8827",
      "id": "topic_1771197877739_8827",
      "name": "37. İdare Hukuku - 1",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877846_2734",
      "id": "topic_1771197877846_2734",
      "name": "38. İdare Hukuku - 2",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197877956_8408",
      "id": "topic_1771197877956_8408",
      "name": "39. İdare Hukuku - 3",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197878058_9936",
      "id": "topic_1771197878058_9936",
      "name": "40. İdare Hukuku - 4",
      "questionCount": 0
    },
    {
      "docId": "topic_1771197878165_8954",
      "id": "topic_1771197878165_8954",
      "name": "41. İdare Hukuku - 5",
      "questionCount": 0
    }
  ],
  "guncel": [
    {
      "docId": "gn_bilim",
      "id": "gn_bilim",
      "name": "Bilim ve Teknoloji",
      "questionCount": 1
    },
    {
      "docId": "gn_guncel_dunya",
      "id": "gn_guncel_dunya",
      "name": "Dünya Gündemi",
      "questionCount": 39
    },
    {
      "docId": "gn_kultur_sanat",
      "id": "gn_kultur_sanat",
      "name": "Kültür ve Sanat",
      "questionCount": 1
    },
    {
      "docId": "gn_spor",
      "id": "gn_spor",
      "name": "Spor",
      "questionCount": 11
    },
    {
      "docId": "gn_guncel_tr",
      "id": "gn_guncel_tr",
      "name": "Türkiye Gündemi",
      "questionCount": 62
    },
    {
      "docId": "gn_uluslararasi",
      "id": "gn_uluslararasi",
      "name": "Uluslararası Kuruluşlar",
      "questionCount": 19
    }
  ]
};

export const FALLBACK_QUESTIONS: Record<string, SeedQuestion[]> = {
  "tarih": [
    {
      "id": "1768220934393.9126",
      "question": "I. Göktürk Devleti’nin yıkılış sürecinde Tapo Kağan’dan sonra doğu ve batı olarak ikiye ayrılmasıyla ilgili aşağıdaki eşleştirmelerden hangisi kaynak metne göre doğrudur?",
      "options": [
        "Batı: İşbara/Kireli, Doğu: Tardu",
        "Batı: Tardu, Doğu: İşbara/Kireli",
        "Batı: İstemi Yabgu, Doğu: Bumin Kağan",
        "Batı: Tapo Kağan, Doğu: Mukan Kağan",
        "Batı: Kutluk Kağan, Doğu: İşbara/Kireli"
      ],
      "answer": 1,
      "explanation": "Devletin ikiye ayrılma sürecinde (Mukan’dan sonra Tapo Kağan döneminin ardından) Batı'da Tardu, Doğu'da İşbara/Kireli'nin bulunduğu belirtilmiştir [8].",
      "courseId": "tarih",
      "topicDocId": "t_islamiyet_oncesi",
      "topicName": "1. İslamiyet Öncesi Türk Tarihi"
    },
    {
      "id": "1768220934393.9006",
      "question": "I. Göktürk Devleti'nin coğrafi konumu ve genel özelliği nasıl ifade edilmiştir?",
      "options": [
        "Orta Asya’da kurulan ve bu bölgede en geniş sınırlara ulaşan Türk devleti.",
        "İran coğrafyasında kurulan en geniş sınırlı devlet.",
        "İkili teşkilatı kuran tek Türk devleti.",
        "Batı Türkistan'da kurulan ilk Türk devleti.",
        "Karabalgasun merkezli kurulan ilk Türk devleti."
      ],
      "answer": 0,
      "explanation": "Orta Asya’da kurulan ve bu bölgede en geniş sınırlara ulaşan Türk devleti Göktürklerdir [1].",
      "courseId": "tarih",
      "topicDocId": "t_islamiyet_oncesi",
      "topicName": "1. İslamiyet Öncesi Türk Tarihi"
    },
    {
      "id": "1768220934393.4172",
      "question": "Uygur mimarisinde dini ibadet için inşa edilen ve kaynak metinde adları geçen yapılar arasında aşağıdakilerden hangisi yer almaz?",
      "options": [
        "Balık",
        "Pagoda",
        "Hepsi",
        "Stupa",
        "Burkan"
      ],
      "answer": 0,
      "explanation": "Stupa, Pagoda ve Burkan tapınak isimleridir. Balık ise şehirlere verilen addır (örneğin Ordubalık) [19], [23].",
      "courseId": "tarih",
      "topicDocId": "t_islamiyet_oncesi",
      "topicName": "1. İslamiyet Öncesi Türk Tarihi"
    },
    {
      "id": "1770491885601.7144",
      "question": "Kaynak metinde 'İç Batı Anadolu ve Göller Yöresi Beylikleri' başlığı altında zikredilen ve merkezleri Denizli (Ladik) olan beylik hangisidir?",
      "options": [
        "Hamitoğulları",
        "İnançoğulları",
        "Eşrefoğulları",
        "Sahipataoğulları",
        "Teke Beyliği"
      ],
      "answer": 1,
      "explanation": "İnançoğulları Denizli ve çevresinde (Ladik) kurulmuştur.",
      "courseId": "tarih",
      "topicDocId": "t_turk_islam",
      "topicName": "2. İlk Türk - İslam Devletleri ve Beylikleri"
    },
    {
      "id": "1770494128755.635",
      "question": "Haçlı Seferlerinin siyasi nedenleri arasında zikredilen ve Bizans'ın yardım istemesine yol açan temel gelişme aşağıdakilerden hangisidir?",
      "options": [
        "Hıttin Savaşı'nda Kudüs'ün kaybedilmesi",
        "Otlukbeli Savaşı'nın yapılması",
        "Malazgirt Savaşı sonrası Türklerin ilerleyişi",
        "Otrar Faciası'nın yaşanması",
        "Bizans'ta Latin Krallığı'nın kurulması"
      ],
      "answer": 2,
      "explanation": "Siyasi nedenler arasında 'Malazgirt Savaşı sonrası Bizans’ın yardım istemesi' belirtilmiştir.",
      "courseId": "tarih",
      "topicDocId": "t_turk_islam",
      "topicName": "2. İlk Türk - İslam Devletleri ve Beylikleri"
    },
    {
      "id": "1770206769234.3416",
      "question": "Ani Kalesi ve Kars'ın (Gürcistan bölgesi) fethi hangi Selçuklu Sultanı döneminde gerçekleşmiştir?",
      "options": [
        "Tuğrul Bey",
        "Sultan Sencer",
        "Sultan Alparslan",
        "Melikşah",
        "Arslan Yabgu"
      ],
      "answer": 2,
      "explanation": "Alparslan döneminde Ani Kalesi ve Kars (Gürcistan bölgesi) fethedilmiştir.",
      "courseId": "tarih",
      "topicDocId": "t_turk_islam",
      "topicName": "2. İlk Türk - İslam Devletleri ve Beylikleri"
    },
    {
      "id": "1770810795261.6372",
      "question": "Uzun Hasan’ın Fatih Sultan Mehmet ile yaptığı Otlukbeli Savaşı’na kadar, Akkoyunluların hangi siyasi olayda Timur’un yanında yer aldığı belirtilmiştir?",
      "options": [
        "Hıttin Savaşı",
        "Yassıçemen Savaşı",
        "Ankara Savaşı",
        "Yüzyıl Savaşları",
        "Miryokefalon Savaşı"
      ],
      "answer": 2,
      "explanation": "Ankara Savaşı’nda Timur’un yanında yer almışlardır.",
      "courseId": "tarih",
      "topicDocId": "manual_topic_1770634494878_0",
      "topicName": "2a. Haçlı Seferleri - Yakın Doğu Asya Anadolu Devletleri"
    },
    {
      "id": "1770810795261.7175",
      "question": "1230 Yassıçemen Savaşı sonucunda Harzemşahlar’ın yenilgi alması, hangi devletin Anadolu’da güçlenmesine ve dolaylı olarak Moğol tehdidiyle yüzleşmesine yol açmıştır?",
      "options": [
        "Osmanlı Devleti",
        "Safevi Devleti",
        "Anadolu Selçuklu Devleti",
        "Karakoyunlular",
        "Eyyubiler"
      ],
      "answer": 2,
      "explanation": "Harzemşahlar, Anadolu Selçuklu Devleti ile Yassıçemen Savaşı'nı yapmış ve kaybetmiştir. (Metinde sonuç olarak ASD'nin güçlenmesi geçmese de, ASD'nin savaşı kazanması zor bir çıkarım olarak kabul edilebilir.)",
      "courseId": "tarih",
      "topicDocId": "manual_topic_1770634494878_0",
      "topicName": "2a. Haçlı Seferleri - Yakın Doğu Asya Anadolu Devletleri"
    }
  ],
  "turkce": [
    {
      "id": "1773972592399.1423",
      "question": "Kök bilgisiyle ilgili olarak aşağıdakilerden hangisi bir sözcüğün kökünü belirlemede temel bir kriterdir?",
      "options": [
        "Sadece sözcüğün anlamlı en küçük parçasını bulmak",
        "Sözcüğün tamamıyla anlamsal ilişkiyi sürdürmek",
        "Sözcüğü hecelerine ayırarak kökü saptamak",
        "Sözcüğün aldığı eklerin türüne bakmak",
        "Sözcüğü köken bilgisine göre ayırmak"
      ],
      "answer": 1,
      "explanation": "Metne göre bulunan kök, sözcüğün tamamıyla anlamsal ilişkisini mutlaka sürdürmelidir.",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339100_6854",
      "topicName": "1. Kök Bilgisi - Yapı Bilgisi"
    },
    {
      "id": "1773972592399.104",
      "question": "Aşağıdaki sözcüklerden hangisinin kökü diğerlerinden farklı bir kök türüdür?",
      "options": [
        "Sorguladılar",
        "Sınavdan",
        "Tutumluyum",
        "Batıyor",
        "Vatandaşlık"
      ],
      "answer": 4,
      "explanation": "Vatandaşlık sözcüğünün kökü 'vatan' ismidir; diğerleri ise fiil kökünden türemiştir.",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339100_6854",
      "topicName": "1. Kök Bilgisi - Yapı Bilgisi"
    },
    {
      "id": "1773972592399.6433",
      "question": "'Balıkçılık' sözcüğünün kökü belirlenirken 'bal' sözcüğünün alınmamasının gerekçesi nedir?",
      "options": [
        "Bal sözcüğünün kök olamayacak kadar kısa olması",
        "Balıkçılık ile bal sözcüğü arasında anlam ilişkisi bulunmaması",
        "Bal sözcüğünün sadece bir hece olması",
        "Balıkçılık sözcüğünün isim kökünden türemesi",
        "Bal sözcüğünün yapım eki almış olması"
      ],
      "answer": 1,
      "explanation": "Metne göre 'Bal' ile balıkçılık arasında anlam ilişkisi yoktur.",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339100_6854",
      "topicName": "1. Kök Bilgisi - Yapı Bilgisi"
    },
    {
      "id": "1773972948161.2358",
      "question": "Aşağıdakilerden hangisi bir isim fiil örneğidir?",
      "options": [
        "Gülen",
        "Okumayı",
        "Gelip",
        "Okudukça",
        "Yazar"
      ],
      "answer": 1,
      "explanation": "Metne göre -ma eki isim fiil ekidir, dolayısıyla 'okumayı' bir isim fiil örneğidir.",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339393_3309",
      "topicName": "2. Yapım Ekleri - Yapı Bilgisi"
    },
    {
      "id": "1773973315204.6318",
      "question": "\"Anaçtı\" kelimesinin türetilme süreci nedir?",
      "options": [
        "Ana (fiil kökü) - aç (fiilden isim)",
        "An (fiil kökü) - aç (fiilden isim)",
        "Ana (isim kökü) - aç (isimden isim yapım eki)",
        "Anaç (isim kökü) - tı (çekim eki)",
        "Ana (isim kökü) - ç (isimden fiil yapım eki)"
      ],
      "answer": 2,
      "explanation": "Metne göre anaçtı: ana (isim kökü) -> anaç (isimden isim).",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339393_3309",
      "topicName": "2. Yapım Ekleri - Yapı Bilgisi"
    },
    {
      "id": "1773972805547.176",
      "question": "Türkçede 'Yapım Eki - Çekim Eki Hiyerarşisi'nin istisnaları için hangisi söylenebilir?",
      "options": [
        "Her zaman kökten önce gelirler.",
        "Her zaman yapım ekinden önce gelirler.",
        "Çekim ekinden sonra gelerek hiyerarşiyi bozarlar.",
        "Kurala uygun olarak köke doğrudan eklenirler.",
        "Sadece fiil köklerinde görülürler."
      ],
      "answer": 2,
      "explanation": "Metne göre bu istisnalar çekim ekinden sonra gelerek temel hiyerarşiyi bozarlar.",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339393_3309",
      "topicName": "2. Yapım Ekleri - Yapı Bilgisi"
    },
    {
      "id": "1773974334053.9548",
      "question": "Çekim eklerinin sözcükteki temel işlevi aşağıdakilerden hangisidir?",
      "options": [
        "A) Sözcüğün anlamını değiştirmek",
        "B) Yeni sözcük türetmek",
        "C) Sözcüğün cümledeki görevini belirlemek",
        "D) İsim köklerini fiil köküne dönüştürmek",
        "E) Sözcüğün kökünü değiştirmek"
      ],
      "answer": 2,
      "explanation": "Metinde çekim eklerinin tanımı, sözcüğün başka sözcüklerle çekime girmesini sağlayan ve cümledeki görevini belirleyen ekler olarak ifade edilmiştir.",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339517_7563",
      "topicName": "3. Çekim Ekleri - Yapı Bilgisi"
    },
    {
      "id": "1773974334053.103",
      "question": "Yapım ekleri ile çekim ekleri arasındaki temel fark nedir?",
      "options": [
        "A) Yapım ekleri anlamı değiştirir, çekim ekleri değiştirmez",
        "B) Çekim ekleri kök ile birleşir, yapım ekleri birleşmez",
        "C) Yapım ekleri sadece fiillere gelir",
        "D) Çekim ekleri sözcük türetir",
        "E) Yapım ekleri cümle kurmayı sağlar"
      ],
      "answer": 0,
      "explanation": "Metne göre çekim ekleri, yapım ekleri gibi yeni sözcükler türetmez ve sözcüğün anlamını değiştirmez.",
      "courseId": "turkce",
      "topicDocId": "topic_1773972339517_7563",
      "topicName": "3. Çekim Ekleri - Yapı Bilgisi"
    }
  ],
  "cografya": [
    {
      "id": "1770555959702.0208",
      "question": "Mutlak (matematik) konumu belirleyen temel unsurlar dikkate alındığında, aşağıdaki koordinatlardan hangisi Türkiye'nin bulunduğu enlem ve boylam aralığını tam olarak ifade eder?",
      "options": [
        "26°-45° Kuzey enlemleri ile 36°-42° Doğu boylamları",
        "36°-42° Kuzey enlemleri ile 26°-45° Batı boylamları",
        "36°-42° Kuzey enlemleri ile 26°-45° Doğu boylamları",
        "26°-45° Kuzey enlemleri ile 36°-42° Doğu boylamları",
        "36°-45° Kuzey enlemleri ile 26°-42° Doğu boylamları"
      ],
      "answer": 2,
      "explanation": "Kaynak metne göre Türkiye, 36°-42° Kuzey enlemleri ile 26°-45° Doğu boylamları arasında yer almaktadır.",
      "courseId": "cografya",
      "topicDocId": "manual_topic_1769984168353_0",
      "topicName": "1. Türkiye'nin Coğrafi Konumu"
    },
    {
      "id": "1770555959702.3853",
      "question": "Türkiye’nin orta kuşakta (ılıman kuşakta) yer almasının sonuçları 'BCDA' formülü ile özetlenmiştir. Aşağıdakilerden hangisi bu formülün sonuçlarından biri değildir?",
      "options": [
        "Batı Rüzgarları görülmesi",
        "Cephe Yağışlarının görülmesi",
        "Dört Mevsimin belirgin olarak yaşanması",
        "Ekvator'un kuzeyinde yer alması",
        "Akdeniz İkliminin görülmesi"
      ],
      "answer": 3,
      "explanation": "Ekvator’un kuzeyinde yer alması (Kuzey Yarım Küre) orta kuşak (BCDA) sonucu değil, doğrudan mutlak konumun tanımıdır. BCDA sonuçları: Batı Rüzgarları, Cephe Yağışları, Dört Mevsim, Akdeniz İklimi'dir.",
      "courseId": "cografya",
      "topicDocId": "manual_topic_1769984168353_0",
      "topicName": "1. Türkiye'nin Coğrafi Konumu"
    },
    {
      "id": "1770555959702.4934",
      "question": "Kaynak metinde tanımı yapılan Cephe Yağışlarının temel oluşum sebebi aşağıdakilerden hangisidir?",
      "options": [
        "Yükselti ve yer şekillerinin etkisi",
        "Sıcak ve soğuk havanın karşılaşması",
        "Denizellik ve karasallık farkları",
        "Yengeç dönencesine yakınlık",
        "Yıl boyunca sadece batı rüzgarlarının etkisi"
      ],
      "answer": 1,
      "explanation": "Cephe Yağışları, kaynak metinde belirtildiği gibi, (sıcak ve soğuk havanın karşılaşması) sonucunda görülür ve Orta Kuşak’ta yer almanın sonucudur.",
      "courseId": "cografya",
      "topicDocId": "manual_topic_1769984168353_0",
      "topicName": "1. Türkiye'nin Coğrafi Konumu"
    },
    {
      "id": "1774380143986.2231",
      "question": "İç Anadolu Bölgesi'ndeki Peri bacalarının oluşumunda etkili olan temel yapı aşağıdakilerden hangisidir?",
      "options": [
        "Karstik aşınım",
        "Volkanik arazi",
        "Buzul birikimi",
        "Rüzgar birikimi",
        "Akarsu birikimi"
      ],
      "answer": 1,
      "explanation": "Nevşehir/Ürgüp/Göreme çevresi volkanik arazidir ve peri bacaları burada bulunur.",
      "courseId": "cografya",
      "topicDocId": "topic_1774123170801_5411",
      "topicName": "2. Türkiye’nin Yer Şekilleri - (İç ve Dış Kuvvet)"
    },
    {
      "id": "1774378731902.0286",
      "question": "Kıtaların birbirini sıkıştırması ve hareketliliği hakkında hangisi doğrudur?",
      "options": [
        "Bu süreç zamanla sona erer",
        "Bu süreç durduğunda dünyadaki hayat da biter",
        "Sadece okyanus tabanlarında görülür",
        "Dünya üzerindeki hayatı etkilemez",
        "Sadece dış kuvvetlerin etkisidir"
      ],
      "answer": 1,
      "explanation": "Bu döngü tamamen durduğunda dünyadaki hayat da biter.",
      "courseId": "cografya",
      "topicDocId": "topic_1774123170801_5411",
      "topicName": "2. Türkiye’nin Yer Şekilleri - (İç ve Dış Kuvvet)"
    },
    {
      "id": "1774378731902.1147",
      "question": "Dış kuvvetlerin genel özelliği aşağıdakilerden hangisidir?",
      "options": [
        "Magmadan enerji alarak yapıcı etki yapmaları",
        "Yerin derinliklerinden gelmeleri",
        "İç kuvvetlerin oluşturduğu şekilleri aşındırarak bozmaya çalışmaları",
        "Sadece atmosferik olaylardan bağımsız olmaları",
        "Yer şekillerini sürekli yükseltmeleri"
      ],
      "answer": 2,
      "explanation": "Dış kuvvetler, kaynağını atmosferden alan ve iç kuvvetlerin ortaya çıkardığı yer şekillerini aşındırarak bozmaya çalışan yıkıcı kuvvetlerdir.",
      "courseId": "cografya",
      "topicDocId": "topic_1774123170801_5411",
      "topicName": "2. Türkiye’nin Yer Şekilleri - (İç ve Dış Kuvvet)"
    },
    {
      "id": "1774385695922.9143",
      "question": "Türkiye'de taş kömürü yataklarının yaygın olduğu ana bölge hangisidir?",
      "options": [
        "Kırşehir",
        "Anamur",
        "Zonguldak-Bartın",
        "İzmir-Manisa",
        "Yıldız Dağları"
      ],
      "answer": 2,
      "explanation": "Metinde taş kömürü yataklarının özellikle Zonguldak-Bartın çevresinde olduğu belirtilmiştir.",
      "courseId": "cografya",
      "topicDocId": "topic_1774123189535_4181",
      "topicName": "3. Türkiye’nin Yer Şekilleri - (Jeolojik Zamanlar)"
    },
    {
      "id": "1774385841051.5686",
      "question": "İkinci zamanda Anadolu'da neden karasal canlılar yerine deniz canlıları bulunmuştur?",
      "options": [
        "İklim çok soğuk olduğu için.",
        "Anadolu sular altında olduğu için.",
        "Karasal canlılar henüz evrimleşmediği için.",
        "Besin zinciri denizlerde olduğu için.",
        "Yüksek oksijen seviyesi nedeniyle."
      ],
      "answer": 1,
      "explanation": "Metne göre dönemde Anadolu sular altında olduğu için karasal canlılar yerine deniz canlıları yaşamıştır.",
      "courseId": "cografya",
      "topicDocId": "topic_1774123189535_4181",
      "topicName": "3. Türkiye’nin Yer Şekilleri - (Jeolojik Zamanlar)"
    }
  ],
  "vatandaslik": [
    {
      "id": "1771198015102.248",
      "question": "Sosyal düzen kurallarından hangisi hem bu dünyada hem de ahirette etkili olan kuralları kapsar?",
      "options": [
        "Uhrevi Din Kuralları",
        "Subjektif Ahlak Kuralları",
        "Dünyevi Din Kuralları",
        "Görgü Kuralları",
        "Objektif Ahlak Kuralları"
      ],
      "answer": 2,
      "explanation": "Dünyevi Din Kuralları: 'Etkisi hem bu dünyada hem de ahirette görülen... kurallardır.'",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197873729_1714",
      "topicName": "1. Sosyal Düzen Kuralları"
    },
    {
      "id": "1771198015102.2383",
      "question": "Aşağıdakilerden hangisi bir yaptırım türü değil, yaptırımın niteliğini tanımlayan bir ifadedir?",
      "options": [
        "Ceza",
        "Tazminat",
        "Manevi Yaptırım",
        "Cebri İcra",
        "Hükümsüzlük"
      ],
      "answer": 2,
      "explanation": "Manevi Yaptırım, yaptırımın devlet dışı kaynaklı olduğunu belirten niteliğidir. Diğerleri ise hukuki yaptırım türleridir.",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197873729_1714",
      "topicName": "1. Sosyal Düzen Kuralları"
    },
    {
      "id": "1771198015102.7754",
      "question": "Aşağıdakilerden hangisi, Kaynak Metin’de hukuki yaptırım türleri arasında sayılan, ancak manevi yaptırımla karıştırılma ihtimali yüksek olan kavramlardan biri değildir?",
      "options": [
        "Ceza",
        "İptal",
        "Hükümsüzlük",
        "Dışlanma",
        "Tazminat"
      ],
      "answer": 3,
      "explanation": "Ceza, İptal, Hükümsüzlük ve Tazminat maddi hukuki yaptırımdır. Dışlanma, manevi yaptırım örneğidir.",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197873729_1714",
      "topicName": "1. Sosyal Düzen Kuralları"
    },
    {
      "id": "1771751692487.565",
      "question": "Hukukun temel görevleri arasında aşağıdakilerden hangisi yer almaz?",
      "options": [
        "Toplumda barışı sağlamak.",
        "Toplumda adaleti sağlamak.",
        "Hukuki güvenliği sağlamak.",
        "Yeni oluşum ve gelişmelere cevap vermek.",
        "Toplumda mutlak eşitliği sağlamak."
      ],
      "answer": 4,
      "explanation": "Kaynak metinde 'Toplumda mutlak eşitliği sağlamak' hukukun bir görevi değildir; mutlak eşitlik adalet anlayışına terstir' ifadesi açıkça belirtilmiştir.",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197874005_7193",
      "topicName": "2. Hukuk Kurallarının Yaptırımları"
    },
    {
      "id": "1771751692487.553",
      "question": "İdare tarafından yapılan hukuka aykırı bir kamulaştırma işleminin ortadan kaldırılması, hangi yaptırım türüne örnek teşkil eder?",
      "options": [
        "Ceza",
        "Cebri İcra",
        "Tazminat",
        "İptal",
        "Mutlak Butlan"
      ],
      "answer": 3,
      "explanation": "Kaynak metinde İptal başlığı altında 'Hukuka aykırı yapılan kamulaştırma... iptalleri' örnek olarak verilmiştir.",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197874005_7193",
      "topicName": "2. Hukuk Kurallarının Yaptırımları"
    },
    {
      "id": "1771751692487.5835",
      "question": "Bir idari işlemin iptali ile bir hukuki işlemin yokluğu arasındaki temel fark aşağıdakilerden hangisidir?",
      "options": [
        "İptalde işlem en baştan itibaren geçersizken, yoklukta işlem sonradan geçersiz hale getirilir.",
        "İptal idari yargı mahkemeleri tarafından verilirken, yokluk için mahkeme kararına ihtiyaç yoktur, işlem hiç doğmamış sayılır.",
        "Yoklukta kurucu unsurlar tamdır ancak işlem sakattır, iptalde ise kurucu unsurlar eksiktir.",
        "İptal sadece özel hukuk alanındaki işlemleri kapsarken, yokluk kamu hukuku alanındaki işlemleri de kapsar.",
        "İptal durumunda işlemin geçerlilik süresi askıya alınırken, yoklukta işlem direkt ortadan kalkar."
      ],
      "answer": 1,
      "explanation": "Kaynak metinde İptal için 'idari yargı mahkemeleri tarafından bu işlemin ortadan kaldırılmasıdır' denilirken, Yokluk için 'İşlem en baştan beri hiç doğmamış, hiç yapılmamış sayılır' ifadesi kullanılmıştır. Yoklukta işlem kendiliğinden geçersizdir, mahkeme kararı işlemin hiç var olmadığını tespit eder.",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197874005_7193",
      "topicName": "2. Hukuk Kurallarının Yaptırımları"
    },
    {
      "id": "1771758553297.4973",
      "question": "Aşağıdaki ifadelerden hangisi Pozitif Hukuk için bir anahtar kelime olarak belirtilmiştir?",
      "options": [
        "Yalnızca yazılı olan kurallar",
        "Uygulamadan kaldırılmış",
        "Yazılı ve yazısız kaynakların tamamı",
        "Olan değil, olması gereken",
        "Yetkili makamların koyduğu kurallar"
      ],
      "answer": 2,
      "explanation": "Kaynak metinde ''Yazılı ve yazısız kaynakların tamamı' ifadesi, pozitif hukukun temel anahtar kelimesidir.' denilmektedir.",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197874123_8263",
      "topicName": "3. Hukukun Türleri ve Hukuk Kurallarının Çeşitleri"
    },
    {
      "id": "1771758683220.517",
      "question": "Aşağıdakilerden hangisi Tamamlayıcı Hukuk Kurallarına bir örnektir?",
      "options": [
        "Amca ile yeğen evliliğinin yasaklanması",
        "'Tacir' kavramının tanımı",
        "Mirasın reddi hakkının kullanılması",
        "Borç sözleşmesinde ödeme yeri belirtilmediğinde kanuni hükmün devreye girmesi",
        "'Ayın başı' ifadesinden 1. günün anlaşılması"
      ],
      "answer": 3,
      "explanation": "Bir borç sözleşmesinde ödeme yeri belirtilmediğinde kanundaki 'para borçlarında alacaklının ikametgahında ödeme yapılır' hükmünün uygulanması, eksik bırakılan konuyu tamamlar ve Tamamlayıcı Hukuk Kurallarına örnektir.",
      "courseId": "vatandaslik",
      "topicDocId": "topic_1771197874123_8263",
      "topicName": "3. Hukukun Türleri ve Hukuk Kurallarının Çeşitleri"
    }
  ],
  "guncel": [
    {
      "id": "1776867469381.0073",
      "question": "Aşağıdakilerden hangisi, kuantum bilgisayarların klasik bilgisayarlara göre potansiyel olarak üstünlük sağladığı alanlardan biridir?",
      "options": [
        "Veri tabanı yönetimi",
        "Metin işleme",
        "Grafik tasarım",
        "Kriptografik algoritmaların kırılması",
        "Ofis uygulamaları"
      ],
      "answer": 3,
      "explanation": "Kuantum bilgisayarlar, süperpozisyon ve dolaşıklık gibi kuantum mekaniği prensiplerini kullanarak belirli hesaplama problemlerini klasik bilgisayarlardan çok daha hızlı çözebilirler. Özellikle Shor algoritması gibi kuantum algoritmaları, günümüzde kullanılan birçok kriptografik algoritmanın (RSA gibi) kırılmasında potansiyel bir tehdit oluşturmaktadır.",
      "courseId": "guncel",
      "topicDocId": "gn_bilim",
      "topicName": "Bilim ve Teknoloji"
    },
    {
      "id": "1769913928722.777",
      "question": "2024 yılında Uluslararası Adalet Divanı (UAD), bir devletin başka bir devlete karşı başlattığı 'soykırım sözleşmesinin ihlali' iddiasıyla açılan davada, ülkenin soykırımı önlemek için acil önlemler almasına hükmetmiştir. Bu karar hangi ülkenin Güney Afrika tarafından açılan davası sonucunda alınmıştır?",
      "options": [
        "Myanmar (Rohingya krizinde)",
        "İsrail (Gazze operasyonlarında)",
        "Rusya (Ukrayna işgalinde)",
        "Suriye (İç savaşta)",
        "Etiyopya (Tigray krizinde)"
      ],
      "answer": 1,
      "explanation": "Ocak 2024'te UAD, Güney Afrika'nın İsrail'e karşı açtığı davada, İsrail'in Gazze'de soykırım yapıldığı iddialarıyla ilgili olarak soykırımı önleyici acil tedbirler almasına karar vermiştir.",
      "courseId": "guncel",
      "topicDocId": "gn_guncel_dunya",
      "topicName": "Dünya Gündemi"
    },
    {
      "id": "1769913928722.7625",
      "question": "2023 yılında yapılan ve Brezilya, Rusya, Hindistan, Çin ve Güney Afrika'dan oluşan BRICS Zirvesi'nde, altı yeni ülkenin örgüte davet edilmesi kararlaştırılmıştır. Bu yeni üyelerden hangisi, 2024 yılının başlarında örgüte tam üye olarak katılma davetini reddederek küresel gündemde dikkat çekmiştir?",
      "options": [
        "Suudi Arabistan",
        "Birleşik Arap Emirlikleri",
        "Arjantin",
        "Etiyopya",
        "Mısır"
      ],
      "answer": 2,
      "explanation": "Arjantin, BRICS grubuna davet edilen ülkelerden biri olmasına rağmen, yeni seçilen Devlet Başkanı Javier Milei, ülkesinin bu daveti kabul etmeyeceğini resmi olarak bildirmiştir. Bu karar, BRICS’in genişleme sürecindeki en önemli geri çekilmedir.",
      "courseId": "guncel",
      "topicDocId": "gn_guncel_dunya",
      "topicName": "Dünya Gündemi"
    },
    {
      "id": "1769913928722.0212",
      "question": "2023 yılında Küresel Finans Sistemi'nde risk teşkil eden bankaların kurtarılmasında kullanılan ve hisse senedi sahiplerinin ve tahvil yatırımcılarının öncelikli olarak zarara katılmasını sağlayan mekanizmanın adı nedir?",
      "options": [
        "Swap anlaşmaları",
        "Basel III düzenlemeleri",
        "Bail-out",
        "Bail-in",
        "Parasal gevşeme"
      ],
      "answer": 3,
      "explanation": "'Bail-in' (içten kurtarma) mekanizması, bankanın kurtarılması için devlet fonları yerine, bankanın yatırımcılarının (hisse ve tahvil sahipleri) sermaye kaybına uğratılmasını öngörür. 2023'te İsviçre'de Credit Suisse krizinde bu mekanizma tartışılmıştır.",
      "courseId": "guncel",
      "topicDocId": "gn_guncel_dunya",
      "topicName": "Dünya Gündemi"
    },
    {
      "id": "1776930352209.4832",
      "question": "16. yüzyılda yaşamış olan ve 'Divan Edebiyatı'nın en önemli temsilcilerinden biri kabul edilen, özellikle 'Gazel' türündeki eserleriyle tanınan, aşk, tasavvuf ve dünya felsefesini iç içe işleyen, 'Bâkî' mahlasıyla tanınan şair kimdir?",
      "options": [
        "Fuzûlî",
        "Nef'î",
        "Bâkî",
        "Hayâlî Bey",
        "Şeyh Galip"
      ],
      "answer": 2,
      "explanation": "Bâkî, 16. yüzyılın en önemli Divan şairlerinden biridir. Gazel türündeki eserleriyle ünlüdür ve aşk, tasavvuf ve dünya felsefesini şiirlerinde ustalıkla birleştirmiştir. 'Bâkî' mahlasıyla tanınır.",
      "courseId": "guncel",
      "topicDocId": "gn_kultur_sanat",
      "topicName": "Kültür ve Sanat"
    },
    {
      "id": "1776843939981.7322",
      "question": "1. **Türkiye'de orman üst sınırının en yükseğe ulaştığı bölge ve bu durumun nedenleri hakkında bazı coğrafi faktörler öne çıkmaktadır.",
      "options": [
        "Yalnız I",
        "Yalnız II",
        "I ve II",
        "II ve III",
        "I, II ve III"
      ],
      "answer": 2,
      "explanation": "",
      "courseId": "guncel",
      "topicDocId": "gn_spor",
      "topicName": "Spor"
    },
    {
      "id": "1776843939981.7212",
      "question": "**İç bölgelerdeki karasal ormanların genel yapısı ve barındırdığı başlıca ağaç türleri belirli özellikler taşır.",
      "options": [
        "Yalnız I",
        "Yalnız II",
        "I ve II",
        "I ve III",
        "II ve III"
      ],
      "answer": 1,
      "explanation": "",
      "courseId": "guncel",
      "topicDocId": "gn_spor",
      "topicName": "Spor"
    },
    {
      "id": "1776843939981.4148",
      "question": "**Meşe türünün Türkiye'deki dağılışı ve iklim seçiciliği farklı coğrafi bölgelerde çeşitli şekillerde gözlemlenir.",
      "options": [
        "Yalnız I",
        "Yalnız II",
        "I ve II",
        "II ve III",
        "I, II ve III"
      ],
      "answer": 2,
      "explanation": "",
      "courseId": "guncel",
      "topicDocId": "gn_spor",
      "topicName": "Spor"
    }
  ]
};

export const INITIAL_DAILY_TIPS: string[] = [
  "Türkiye'nin ilk kadın büyükelçisi: Filiz Dinçmen",
  "Nobel Edebiyat Ödülü'nü alan ilk Türk yazar: Orhan Pamuk",
  "Birleşmiş Milletler (BM) Genel Sekreteri: António Guterres",
  "Türkiye'nin en uzun kara sınırı komşusu: Suriye",
  "Türk sinemasının ilk uluslararası ödüllü filmi: Susuz Yaz (Metin Erksan)",
  "NATO'ya en son katılan ülke: İsveç (2024)",
  "UNESCO Dünya Mirası Listesi'ndeki Göbeklitepe'nin bulunduğu il: Şanlıurfa",
  "Küresel ısınmaya karşı imzalanan önemli anlaşma: Paris Anlaşması",
  "Türkiye'nin ilk yerli ve milli haberleşme uydusu: TÜRKSAT 6A",
  "1923 yılında Ankara başkent oldu.",
  "Türkiye'nin ilk kadın heykeltıraşı Sabiha Bengütaş'tır.",
  "Nobel Edebiyat Ödülü'nü alan tek Türk yazar Orhan Pamuk'tur.",
  "Çanakkale Köprüsü'nün resmi adı 1915 Çanakkale Köprüsü'dür.",
  "UNESCO Dünya Mirası Listesi'ndeki Göbeklitepe Şanlıurfa'dadır.",
  "Türkiye'nin ilk yerli otomobili TOGG'dur.",
  "Aşık Veysel'in asıl adı Veysel Şatıroğlu'dur.",
  "Cumhuriyet dönemi ilk opera bestecisi Ahmet Adnan Saygun'dur.",
  "Sümela Manastırı Trabzon'un Maçka ilçesinde yer alır.",
  "Kız Kulesi İstanbul Boğazı'nın Üsküdar kıyısına yakındır.",
  "Türkiye Cumhuriyeti'nin ilk Başbakanı İsmet İnönü'dür.",
  "Kıbrıs Barış Harekatı 1974 yılında gerçekleşmiştir.",
  "Anadolu'da kurulan ilk Türk beyliği Saltuklular'dır.",
  "Divan-ı Lügatit Türk Kaşgarlı Mahmut tarafından yazılmıştır.",
  "\"Kürk Mantolu Madonna\" eseri Sabahattin Ali'ye aittir.",
  "Türkiye Cumhuriyeti'nin ilk Diyanet İşleri Başkanı Rıfat Börekçi'dir.",
  "Türkiye'nin en uzun akarsuyu Kızılırmak'tır.",
  "Ayasofya'yı inşa ettiren Bizans İmparatoru I. Justinianus'tur.",
  "Türkiye'nin en yüksek dağı Ağrı Dağı'dır.",
  "Türkiye'nin en büyük yüz ölçümüne sahip ili Konya'dır.",
  "İlk Diyanet İşleri Başkanı Rıfat Börekçi'dir.",
  "2027 Akdeniz Oyunları Türkiye'nin İzmir şehrinde gerçekleştirilecektir.",
  "Türkiye'nin en uzun kıyı şeridine sahip bölgesi Ege Bölgesi'dir.",
  "1926 yılında İsviçre'den alınan Medeni Kanun ile çok eşlilik yasaklanmıştır.",
  "Devlet Denetleme Kurulu (DDK) sadece Cumhurbaşkanlığına bağlı olarak görev yapar.",
  "Türk Silahlı Kuvvetleri'nin (TSK) Başkomutanlığı görevi TBMM adına Cumhurbaşkanı tarafından temsil edilir.",
  "2026 Kış Olimpiyatları İtalya'da Milano ve Cortina d'Ampezzo şehirlerinde yapılacaktır.",
  "Türkiye'nin en genç volkanik oluşumu Manisa'daki Kula Volkanları'dır.",
  "2026 FIFA Dünya Kupası ABD, Kanada ve Meksika tarafından ortaklaşa düzenlenecektir.",
  "Misakımillî kararları son Osmanlı Mebusan Meclisi'nde alınmıştır.",
  "Kızılırmak, Türkiye sınırları içinde doğup denize dökülen en uzun nehirdir.",
  "Osmanlı Devleti'nde ilk anayasal belge Sened-i İttifak'tır.",
  "Kanun-i Esasi (1876) ile meclisin açılmasına Birinci Meşrutiyet denir.",
  "Milletvekili seçilme yaşı 18'dir.",
  "Anayasa Mahkemesi'nin üye sayısı 15'tir.",
  "En büyük yüz ölçümüne sahip ilimiz Konya'dır.",
  "Türkiye'nin ilk kadın tiyatro oyuncusu Afife Jale'dir.",
  "Cumhuriyet Dönemi'nin ilk Genelkurmay Başkanı Fevzi Çakmak'tır.",
  "Halkçılık ilkesi ilk kez 1921 Anayasası'nda yer almıştır.",
  "Türkiye'nin tek fiyort tipi kıyısı Rize'deki Hamsilos Koyu'dur.",
  "2026 Kış Olimpiyatları İtalya'nın Milano ve Cortina d'Ampezzo şehirlerinde düzenlenecektir.",
  "2027 Avrupa Oyunları (European Games) İstanbul'da yapılacaktır.",
  "2026 FIFA Dünya Kupası, ABD, Meksika ve Kanada'nın ortak ev sahipliğinde gerçekleştirilecektir.",
  "İzmir, 2025 yılında İslam İşbirliği Teşkilatı (İİT) Gençlik Başkenti olacaktır.",
  "Türkiye'de ilk elektrikli tren hattı İstanbul-Sirkeci ve Bakırköy arasındadır.",
  "Milli Güvenlik Kurulu'na (MGK) Cumhurbaşkanı başkanlık eder.",
  "Türkiye'nin en büyük delta ovası Çukurova Deltası'dır.",
  "Türkiye'nin en uzun kara sınırı Suriye ile olan sınırdır",
  "İlk Diyanet İşleri Başkanı Rıfat Börekçi'dir",
  "2026 Kış Olimpiyatları İtalya'nın Milano ve Cortina d'Ampezzo şehirlerinde düzenlenecektir",
  "Türkiye'nin en uzun kara sınırı Suriye ile olan sınırdır.",
  "İlk Diyanet İşleri Başkanı Rifat Börekçi'dir.",
  "Türkiye'nin ilk milli parkı 1958 yılında ilan edilen Yozgat Çamlığı'dır.",
  "İlk kadın savaş pilotu Sabiha Gökçen'dir.",
  "Divan-ı Lügat-it Türk eseri Kaşgarlı Mahmut tarafından yazılmıştır.",
  "Osmanlı Devleti'nin ilk deniz savaşı Çalı Bey Savaşı'dır.",
  "Misak-ı Milli'den verilen ilk taviz, Gümrü Antlaşması ile Batum'dur.",
  "1982 Anayasası'nda yapılan en köklü değişiklik 2017 yılında Cumhurbaşkanlığı Hükümet Sistemi'ne geçiş olmuştur.",
  "Türkiye'nin en büyük yüz ölçümüne sahip coğrafi bölgesi Doğu Anadolu Bölgesi'dir.",
  "Yasama yetkisi Anayasa'ya göre Türkiye Büyük Millet Meclisi'ne (TBMM) aittir.",
  "Tevhid-i Tedrisat Kanunu ile Türkiye'deki tüm eğitim kurumları Milli Eğitim Bakanlığı'na bağlanmıştır.",
  "2026 Kış Olimpiyatları İtalya'da Milano ve Cortina d'Ampezzo şehirlerinde düzenlenecektir.",
  "2025 Dünya Fuarı (Expo) Japonya'nın Osaka kentinde gerçekleştirilecektir.",
  "İdari Yargı'da temyiz mercii Danıştay'dır.",
  "Türkiye'nin ilk yüksek hızlı tren (YHT) hattı Ankara-Eskişehir hattıdır.",
  "Göbeklitepe, Şanlıurfa ilinde bulunan ve dünyanın bilinen en eski megalitik yapılar topluluğudur.",
  "Türk Medeni Kanunu'nun kabulü 1926 yılındadır.",
  "2027 Avrupa Oyunları'na (European Games) İstanbul ev sahipliği yapacaktır.",
  "Türkiye'nin Milli Uzay Programı kapsamında 2025 veya 2026 yıllarında Ay'a sert iniş görevi hedeflenmektedir.",
  "İlk TBMM Başkanı Mustafa Kemal Atatürk'tür.",
  "Türkiye'nin en uzun akarsuyu, doğup ve tamamen ülke sınırları içinde akan Kızılırmak'tır.",
  "Türkiye Cumhuriyeti'nin ilk kadın pilotu Sabiha Gökçen'dir.",
  "Anayasa Mahkemesi, kanunların Anayasaya uygunluğunu şekil ve esas bakımından denetleyen yüksek mahkemedir.",
  "Cumhuriyet döneminin ilk muhalefet partisi Terakkiperver Cumhuriyet Fırkası'dır.",
  "Türkiye'nin en yüksek dağı olan Ağrı Dağı, volkanik bir dağdır.",
  "Misak-ı Milli'den verilen ilk taviz, I. İnönü Savaşı sonrası imzalanan Moskova Antlaşması ile Batum'un Gürcistan'a bırakılmasıdır.",
  "Türkiye'nin ikinci büyük gölü olan Tuz Gölü, tektonik oluşumludur.",
  "Kanun teklif etme yetkisi Türkiye Büyük Millet Meclisi üyelerine aittir.",
  "2026 Kış Olimpiyatları'na İtalya'nın Milano ve Cortina d'Ampezzo şehirleri ev sahipliği yapacaktır.",
  "Türkiye'nin en büyük gölü olan Van Gölü, sodalı ve volkanik set gölüdür.",
  "Cumhuriyet tarihimizde ilk nüfus sayımı 1927 yılında yapılmıştır.",
  "Ege Bölgesi'nde kıyı şeridinin uzun olmasının temel nedeni fiyort tipi kıyıların görülmesi değil, girinti çıkıntının (Rias tipi kıyı) fazla olmasıdır.",
  "İlk kez çok partili hayata geçiş denemesi 1930 yılında kurulan Serbest Cumhuriyet Fırkası ile yapılmıştır.",
  "Cumhurbaşkanlığı Kararnameleri, temel haklar, kişi hakları ve siyasi haklar alanında düzenleme yapamaz.",
  "Hamsilos Koyu, Türkiye'nin tek doğal fiyort görünümlü kıyısıdır ve Sinop'ta yer alır.",
  "2026 FIFA Dünya Kupası'na ABD, Kanada ve Meksika ortak olarak ev sahipliği yapacaktır.",
  "Türkiye'de ilk milli park ilan edilen yer Yozgat Çamlığı Milli Parkı'dır.",
  "2025 Avrupa Kültür Başkentleri arasında Almanya'dan Chemnitz ve Slovenya'dan Nova Gorica şehirleri bulunmaktadır.",
  "Büyük Selçuklu Devleti'nde resmi dil ve eğitim dili Farsça'dır.",
  "Mustafa Kemal Atatürk'ün Samsun'a çıkışı 19 Mayıs 1919'dur.",
  "Türkiye Cumhuriyeti'nin ilk Cumhurbaşkanı Mustafa Kemal Atatürk'tür.",
  "Lozan Barış Konferansı'nda Türkiye'yi İsmet İnönü temsil etmiştir.",
  "Milli Mücadele'de çıkarılan ilk gazete İrade-i Milliye'dir.",
  "Türk Tarih Kurumu ve Türk Dil Kurumu 1932 yılında kurulmuştur.",
  "İlk sivil anayasa 1924 Anayasası'dır.",
  "Saltanatın kaldırılması 1 Kasım 1922 tarihinde gerçekleşmiştir.",
  "Cumhuriyetin ilanı 29 Ekim 1923'tür.",
  "Türkiye'nin ilk kadın Başbakanı Tansu Çiller'dir.",
  "Türkiye'nin ilk kadın pilotu Sabiha Gökçen'dir.",
  "İlk Türk uçağını tasarlayan ve üreten Vecihi Hürkuş'tur.",
  "Anadolu'nun ilk medresesi Danişmentliler dönemine ait Yağıbasan Medresesi'dir.",
  "Divan-ı Lügatit Türk, Kaşgarlı Mahmut tarafından yazılmıştır.",
  "Orhun Abideleri, Türk tarihinin bilinen ilk yazılı belgeleridir.",
  "İstanbul'un fethi 1453 yılında Fatih Sultan Mehmet tarafından gerçekleştirilmiştir.",
  "Mimar Sinan'ın \"ustalık eserim\" dediği yapı Edirne'deki Selimiye Camii'dir.",
  "Çanakkale Savaşları'nın yapıldığı Gelibolu Yarımadası Tarihi Milli Parkı'dır.",
  "Hattuşa (Boğazköy), Hitit Uygarlığı'nın başkentidir.",
  "Efes Antik Kenti İzmir'de yer almaktadır.",
  "Göbeklitepe Şanlıurfa'da yer alan, dünyanın bilinen en eski tapınak kalıntılarıdır.",
  "UNESCO Dünya Mirası Listesi'ndeki ilk eserimiz İstanbul'un Tarihi Alanları'dır.",
  "Troya Antik Kenti, Çanakkale sınırları içinde bulunmaktadır.",
  "Osmanlı Devleti'nde ilk ıslahat hareketleri Lale Devri'nde başlamıştır.",
  "Türkiye'de Medeni Kanun 1926 yılında yürürlüğe girmiştir.",
  "Amasya Genelgesi, Milli Mücadele'nin gerekçe ve yöntemini belirlemiştir.",
  "Misak-ı Milli kararları, son Osmanlı Mebusan Meclisi'nde kabul edilmiştir.",
  "TBMM'nin imzaladığı ilk uluslararası antlaşma Gümrü Antlaşması'dır.",
  "Türkiye'nin ilk yerli otomobili Devrim'dir.",
  "Türkiye'nin en büyük gölü Van Gölü'dür.",
  "Karadeniz Bölgesi, Türkiye'nin en fazla yağış alan bölgesidir.",
  "Türkiye'nin en büyük adası Gökçeada'dır (Çanakkale).",
  "Türkiye'nin en büyük barajı Atatürk Barajı'dır.",
  "Tuz Gölü, Türkiye'nin ikinci büyük gölü olup yazın alanı en çok küçülen göldür.",
  "Ege Bölgesi'ndeki kırgıbayır (Badlands) oluşumları Manisa Kula'da görülür.",
  "Toros Dağları, Akdeniz Bölgesi'nde kıyıya paralel uzanır.",
  "Kıyı Ege Bölgesi'nde görülen kıyı tipi enine kıyı tipidir.",
  "Akdeniz Bölgesi'nde görülen tipik toprak türü kırmızı renkli Terra Rossa'dır.",
  "Türkiye'nin tek fiyort tipi kıyısı Sinop Hamsilos Koyu'dur.",
  "Türkiye'nin en büyük fay hattı Kuzey Anadolu Fay Hattı'dır.",
  "Marmara Bölgesi, yüzölçümü ve yükseltisi en az olan bölgedir.",
  "Doğu Anadolu Bölgesi, yükseltisi ve ortalama kış sıcaklıkları en düşük olan bölgedir.",
  "Pamuk en çok Güneydoğu Anadolu Bölgesi'nde (GAP sayesinde) yetiştirilir.",
  "Çay tarımı yalnızca Doğu Karadeniz Bölgesi'nde yapılmaktadır.",
  "Türkiye'nin en yoğun nüfuslu ili İstanbul'dur.",
  "Türkiye'nin jeotermal potansiyeli en yüksek bölgesi Ege Bölgesi'dir.",
  "Doğalgaz rezervlerinin bulunduğu Karadeniz'deki sahanın adı Sakarya Gaz Sahası'dır.",
  "1982 Anayasası'na göre yasama yetkisi Türkiye Büyük Millet Meclisi'ne aittir.",
  "Yürütme yetkisi ve görevi Cumhurbaşkanı tarafından kullanılır.",
  "Anayasa Mahkemesi, siyasi partilerin kapatılması davalarına bakar.",
  "Türkiye'de yargı yetkisi bağımsız ve tarafsız mahkemelerce kullanılır.",
  "Türkiye Cumhuriyeti bir üniter devlettir.",
  "Temel hak ve özgürlükler, özlerine dokunulmaksızın kanunla sınırlanabilir.",
  "Yargıtay, adli yargının en yüksek mahkemesidir.",
  "Danıştay, idari yargının en yüksek mahkemesidir.",
  "Uyuşmazlık Mahkemesi, adli ve idari yargı mercileri arasındaki görev uyuşmazlıklarını çözer.",
  "Cumhurbaşkanı, beş yıllık süre için seçilir.",
  "Vatandaşlık hakkı, kişi devlete vatandaşlık bağı ile bağlı olma durumudur.",
  "HSK (Hakimler ve Savcılar Kurulu) üye sayısı 13'tür.",
  "Milli Güvenlik Kurulu'nun (MGK) Cumhurbaşkanı başkanlığında toplanır.",
  "Cumhurbaşkanlığı Kararnameleri Anayasa Mahkemesi denetimine tabidir.",
  "Genel oy, eşit oy ve gizli oy ilkeleri seçim esasları arasındadır.",
  "Seçimlerin yargısal denetimi Yüksek Seçim Kurulu (YSK) tarafından yapılır.",
  "2025 Dünya Kitap Başkenti Brezilya'nın Rio de Janeiro şehridir.",
  "2025 Avrupa Spor Başkenti Çekya'nın České Budějovice (Budweis) kentidir.",
  "2025 Dünya Expo etkinliği Japonya'nın Osaka şehrinde gerçekleştirilecektir.",
  "2027 Avrupa Oyunları (European Games) İstanbul'da düzenlenecektir.",
  "2028 Yaz Olimpiyatları ABD'nin Los Angeles şehrinde yapılacaktır.",
  "2030 FIFA Dünya Kupası Fas, İspanya ve Portekiz tarafından ortaklaşa düzenlenecektir.",
  "2032 Yaz Olimpiyatları Avustralya'nın Brisbane şehrinde gerçekleştirilecektir.",
  "2025 yılında uzaya gönderilmesi planlanan Avrupa Uzay Ajansı teleskopu ARIEL'dir.",
  "2025 yılında resmi olarak görevine başlaması hedeflenen ilk yerli haberleşme uydumuz TÜRKSAT 6A'dır.",
  "2026 Dünya Basketbol Şampiyonası Katar'da düzenlenecektir.",
  "2025 FIBA Kadınlar Avrupa Şampiyonası ev sahiplerinden biri Türkiye'dir (Çekya, Almanya ve Yunanistan ile birlikte).",
  "2027 FIBA Basketbol Dünya Kupası Katar'da düzenlenecektir.",
  "2025 yılında yürürlüğe girecek AB Yeşil Mutabakatı, karbon nötr hedefi içerir.",
  "2026 Dünya Salon Atletizm Şampiyonası Polonya'nın Toruń şehrinde düzenlenecektir.",
  "2025 yılında uzaya gönderilmesi planlanan NASA'nın yeni Ay görevlerinden biri Artemis Programı kapsamındadır.",
  "2025 Nobel Ödülleri İsveç'in Stockholm kentinde açıklanacaktır.",
  "2028 Avrupa Futbol Şampiyonası (EURO 2028) İngiltere ve İrlanda Cumhuriyeti tarafından ortaklaşa düzenlenecektir.",
  "2027 yılında Türkiye'de düzenlenecek olan Avrupa Oyunları'nın açılış seremonisi İstanbul'da yapılacaktır.",
  "2026 yılında yapılacak olan Dünya Para Yüzme Şampiyonası Singapur'da düzenlenecektir.",
  "2025 yılında hizmete girmesi beklenen Türkiye'nin yapay zeka tabanlı süper bilgisayarı BİLGEM'dir.",
  "Türkiye'de tarımı yapılan ilk ürün buğdaydır.",
  "İlk Türkçe gazete, II. Mahmut döneminde çıkarılan Takvim-i Vekayi'dir.",
  "Mustafa Kemal Atatürk'e Başöğretmenlik unvanı, Millet Mektepleri Talimatnamesi ile verilmiştir.",
  "Türkiye'nin en uzun kıyı şeridine sahip coğrafi bölgesi Ege Bölgesi'dir.",
  "Türkiye'nin en kalabalık ili İstanbul, en az kalabalık ili Tunceli'dir.",
  "Türkiye'nin en büyük gölü olan Van Gölü, sodalı ve tektonik-volkanik set gölüdür.",
  "\"Taşeli Platosu\" (Karaman-Mersin), Türkiye'nin en büyük karstik platosudur.",
  "İslam İşbirliği Teşkilatı'nın (İİT) ilk genel sekreteri Ekmeleddin İhsanoğlu'dur.",
  "1982 Anayasasına göre, seçimler ve halkoylaması yargısal denetimini Yüksek Seçim Kurulu (YSK) yapar.",
  "Bireysel başvuru hakkı Anayasamızda 2010 yılında yapılan değişiklik ile tanınmıştır.",
  "Cumhurbaşkanlığı Kararnameleri Anayasa Mahkemesi'nin denetimine tabidir.",
  "Olağanüstü hâl süresince çıkarılan Cumhurbaşkanlığı Kararnameleri, Anayasa Mahkemesi'nin denetimine tabi değildir.",
  "Misak-ı Millî'den verilen ilk taviz, 1921 Moskova Antlaşması ile Sovyet Rusya'ya bırakılan Batum'dur.",
  "Türkiye’nin ilk kadın valisi Lale Aytaman (Muğla, 1991) olmuştur.",
  "2026 FIFA Dünya Kupası, Kanada, Meksika ve ABD’nin ortak ev sahipliğinde düzenlenecektir.",
  "2025 Avrupa Salon Atletizm Şampiyonası Hollanda'nın Apeldoorn şehrinde yapılacaktır.",
  "2026 yılından itibaren Avrupa Birliği'nin kültür başkenti unvanını alan ilk şehir Slovakya'dan Olomouc olacaktır."
];
