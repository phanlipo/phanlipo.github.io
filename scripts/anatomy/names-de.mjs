// German names for the anatomy app (anatomy/). Z-Anatomy only has English and Latin, so German comes from here:
// a dictionary for single structures plus a few rules for numbered series (ribs, vertebrae, fingers, teeth …).
// Anything without a German name is shown with its Latin name (TA2) – that is what German anatomy uses anyway.
// Used by scripts/anatomy/pack.mjs; the result lands in anatomy/models/index.json.

const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };

export const DICT = {
  // Skeleton
  'Anterior cells of ethmoid bone': 'Vordere Siebbeinzellen', 'Middle cells of ethmoid bone': 'Mittlere Siebbeinzellen',
  'Posterior cells of ethmoid bone': 'Hintere Siebbeinzellen', 'Arytenoid cartilage': 'Stellknorpel',
  'Atlas (C1)': 'Atlas (1. Halswirbel)', 'Axis (C2)': 'Axis (2. Halswirbel)', 'Body of sternum': 'Brustbeinkörper',
  Calcaneus: 'Fersenbein', 'Capitate bone': 'Kopfbein', Clavicle: 'Schlüsselbein', Coccyx: 'Steißbein',
  'Corniculate cartilage': 'Hörnchenknorpel', 'Cricoid cartilage': 'Ringknorpel', 'Cuboid bone': 'Würfelbein',
  'Ethmoid bone': 'Siebbein', Femur: 'Oberschenkelknochen', Fibula: 'Wadenbein', 'Frontal bone': 'Stirnbein',
  'Hamate bone': 'Hakenbein', 'Hip bone': 'Hüftbein', Humerus: 'Oberarmknochen', 'Hyoid bone': 'Zungenbein',
  Incus: 'Amboss', 'Inferior nasal concha bone': 'Untere Nasenmuschel', 'Intermediate cuneiform bone': 'Mittleres Keilbein (Fuß)',
  'Lateral cuneiform bone': 'Äußeres Keilbein (Fuß)', 'Medial cuneiform bone': 'Inneres Keilbein (Fuß)', 'Lacrimal bone': 'Tränenbein',
  'Lateral process of nasal septal cartilage': 'Seitlicher Nasenknorpel', 'Lunate bone': 'Mondbein',
  'Major alar cartilage': 'Großer Nasenflügelknorpel', Malleus: 'Hammer', Mandible: 'Unterkiefer',
  'Manubrium of sternum': 'Brustbeingriff', Maxilla: 'Oberkiefer', 'Nasal bone': 'Nasenbein',
  'Nasal septal cartilage': 'Nasenscheidewandknorpel', 'Navicular bone': 'Kahnbein (Fuß)', 'Occipital bone': 'Hinterhauptbein',
  'Palatine bone': 'Gaumenbein', 'Parietal bone': 'Scheitelbein', Patella: 'Kniescheibe', 'Pisiform bone': 'Erbsenbein',
  Radius: 'Speiche', Sacrum: 'Kreuzbein', 'Scaphoid bone': 'Kahnbein (Hand)', Scapula: 'Schulterblatt',
  'Sesamoid bones of foot': 'Sesambeine des Fußes', 'Sinus of frontal bone': 'Stirnhöhle', 'Sinus of sphenoid bone': 'Keilbeinhöhle',
  'Sphenoid bone': 'Keilbein (Schädel)', Stapes: 'Steigbügel', Talus: 'Sprungbein', 'Temporal bone': 'Schläfenbein',
  'Thyroid cartilage': 'Schildknorpel', Tibia: 'Schienbein', 'Trapezium bone': 'Großes Vieleckbein',
  'Trapezoid bone': 'Kleines Vieleckbein', 'Triquetrum bone': 'Dreiecksbein', Ulna: 'Elle', Vomer: 'Pflugscharbein',
  'Xiphoid process': 'Schwertfortsatz', 'Zygomatic bone': 'Jochbein',
  // Muscles (the well-known ones; the rest keep their Latin name)
  'Acromial part of deltoid muscle': 'Deltamuskel, mittlerer Teil', 'Clavicular part of deltoid muscle': 'Deltamuskel, vorderer Teil',
  'Scapular spinal part of deltoid muscle': 'Deltamuskel, hinterer Teil', 'Adductor brevis': 'Kurzer Schenkelanzieher',
  'Adductor longus': 'Langer Schenkelanzieher', 'Adductor magnus': 'Großer Schenkelanzieher',
  'Brachialis muscle': 'Oberarmmuskel', 'Brachioradialis muscle': 'Oberarm-Speichen-Muskel', Bucinator: 'Wangenmuskel',
  'Calcaneal tendon': 'Achillessehne', Diaphragm: 'Zwerchfell', 'External abdominal oblique muscle': 'Äußerer schräger Bauchmuskel',
  'Internal abdominal oblique muscle': 'Innerer schräger Bauchmuskel', 'Transversus abdominis muscle': 'Querer Bauchmuskel',
  'Rectus abdominis muscle': 'Gerader Bauchmuskel', 'External intercostal muscles': 'Äußere Zwischenrippenmuskeln',
  'Internal intercostal muscles': 'Innere Zwischenrippenmuskeln', 'Innermost intercostal muscles': 'Innerste Zwischenrippenmuskeln',
  'Frontalis muscle': 'Stirnmuskel', 'Occipitalis muscle': 'Hinterhauptmuskel', 'Gluteus maximus muscle': 'Großer Gesäßmuskel',
  'Gluteus medius muscle': 'Mittlerer Gesäßmuskel', 'Gluteus minimus muscle': 'Kleiner Gesäßmuskel', 'Gracilis muscle': 'Schlanker Muskel',
  'Iliacus muscle': 'Darmbeinmuskel', 'Psoas major': 'Großer Lendenmuskel', 'Iliotibial tract': 'Iliotibialband',
  'Infraspinatus muscle': 'Untergrätenmuskel', 'Supraspinatus muscle': 'Obergrätenmuskel', 'Subscapularis muscle': 'Unterschulterblattmuskel',
  'Teres major muscle': 'Großer Rundmuskel', 'Teres minor muscle': 'Kleiner Rundmuskel', 'Inguinal ligament': 'Leistenband',
  'Latissimus dorsi muscle': 'Breiter Rückenmuskel', 'Levator scapulae': 'Schulterblattheber', 'Linea alba': 'Weiße Linie',
  'Long head of biceps brachii': 'Bizeps, langer Kopf', 'Short head of biceps brachii': 'Bizeps, kurzer Kopf',
  'Long head of triceps brachii': 'Trizeps, langer Kopf', 'Lateral head of triceps brachii': 'Trizeps, äußerer Kopf',
  'Medial head of triceps brachii': 'Trizeps, innerer Kopf', 'Long head of biceps femoris': 'Zweiköpfiger Oberschenkelmuskel, langer Kopf',
  'Short head of biceps femoris': 'Zweiköpfiger Oberschenkelmuskel, kurzer Kopf', 'Lateral head of gastrocnemius': 'Zwillingswadenmuskel, äußerer Kopf',
  'Medial head of gastrocnemius': 'Zwillingswadenmuskel, innerer Kopf', 'Soleus muscle': 'Schollenmuskel',
  'Deep part of masseter': 'Kaumuskel, tiefer Teil', 'Superficial part of masseter': 'Kaumuskel, oberflächlicher Teil',
  'Temporalis muscle': 'Schläfenmuskel', 'Orbicularis oris muscle': 'Ringmuskel des Mundes',
  'Orbital part of orbicularis oculi': 'Ringmuskel des Auges, Augenhöhlenteil', 'Palpebral part of orbicularis oculi': 'Ringmuskel des Auges, Lidteil',
  'Pectoralis minor muscle': 'Kleiner Brustmuskel', 'Clavicular head of pectoralis major muscle': 'Großer Brustmuskel, Schlüsselbeinteil',
  'Sternocostal head of pectoralis major muscle': 'Großer Brustmuskel, Brustbein-Rippen-Teil', 'Abdominal part of pectoralis major muscle': 'Großer Brustmuskel, Bauchteil',
  Platysma: 'Halshautmuskel', 'Rectus femoris muscle': 'Gerader Schenkelmuskel', 'Vastus lateralis muscle': 'Äußerer Schenkelmuskel',
  'Vastus medialis muscle': 'Innerer Schenkelmuskel', 'Vastus intermedius muscle': 'Mittlerer Schenkelmuskel',
  'Rhomboid major muscle': 'Großer Rautenmuskel', 'Rhomboid minor muscle': 'Kleiner Rautenmuskel', 'Sartorius muscle': 'Schneidermuskel',
  'Semimembranosus muscle': 'Plattsehnenmuskel', 'Semitendinosus muscle': 'Halbsehnenmuskel', 'Serratus anterior muscle': 'Vorderer Sägemuskel',
  'Sternocleidomastoid muscle': 'Kopfwender', 'Tibialis anterior muscle': 'Vorderer Schienbeinmuskel',
  'Tibialis posterior muscle': 'Hinterer Schienbeinmuskel', 'Descending part of trapezius muscle': 'Trapezmuskel, absteigender Teil',
  'Transverse part of trapezius muscle': 'Trapezmuskel, querer Teil', 'Ascending part of trapezius muscle': 'Trapezmuskel, aufsteigender Teil',
  'Zygomaticus major muscle': 'Großer Jochbeinmuskel', 'Zygomaticus minor muscle': 'Kleiner Jochbeinmuskel',
  'Fibularis longus muscle': 'Langer Wadenbeinmuskel', 'Fibularis brevis muscle': 'Kurzer Wadenbeinmuskel',
  'Pronator quadratus': 'Quadratischer Einwärtsdreher', Supinator: 'Auswärtsdreher', 'Piriformis muscle': 'Birnenförmiger Muskel',
  'Quadratus lumborum muscle': 'Quadratischer Lendenmuskel', 'Popliteus muscle': 'Kniekehlenmuskel',
  // Organs
  'Accessory parotid gland': 'Nebenohrspeicheldrüse', 'Accessory pancreatic duct': 'Nebengang der Bauchspeicheldrüse',
  Adenohypophysis: 'Hypophysenvorderlappen', Neurohypophysis: 'Hypophysenhinterlappen', 'Ascending colon': 'Aufsteigender Dickdarm',
  'Descending colon': 'Absteigender Dickdarm', 'Transverse colon': 'Querer Dickdarm', 'Sigmoid colon': 'S-förmiger Dickdarm (Sigmoid)',
  'Bile duct': 'Gallengang', 'Corpus cavernosum of penis': 'Penisschwellkörper', 'Corpus spongiosum of penis': 'Harnröhrenschwellkörper',
  'Ductus deferens': 'Samenleiter', Duodenum: 'Zwölffingerdarm', 'Ejaculatory duct': 'Spritzkanälchen', Epididymis: 'Nebenhoden',
  Epiglottis: 'Kehldeckel', 'Free taenia': 'Freie Tänie', 'Omental taenia': 'Netztänie', Gallbladder: 'Gallenblase', Gingiva: 'Zahnfleisch',
  'Glans penis': 'Eichel', 'Inferior lobe of left lung': 'Unterlappen der linken Lunge', 'Inferior lobe of right lung': 'Unterlappen der rechten Lunge',
  'Middle lobe of right lung': 'Mittellappen der rechten Lunge', 'Superior lobe of left lung': 'Oberlappen der linken Lunge',
  'Superior lobe of right lung': 'Oberlappen der rechten Lunge', 'Inferior parathyroid gland': 'Untere Nebenschilddrüse',
  'Superior parathyroid gland': 'Obere Nebenschilddrüse', 'Intermediate bronchus': 'Zwischenbronchus', Jejunum: 'Leerdarm', Kidney: 'Niere',
  Laryngopharynx: 'Kehlkopfrachen', Nasopharynx: 'Nasenrachen', Oropharynx: 'Mundrachen',
  'Left inferior lobar bronchus': 'Linker Unterlappenbronchus', 'Left superior lobar bronchus': 'Linker Oberlappenbronchus',
  'Right inferior lobar bronchus': 'Rechter Unterlappenbronchus', 'Right superior lobar bronchus': 'Rechter Oberlappenbronchus',
  'Middle lobar bronchus': 'Mittellappenbronchus', 'Left main bronchus': 'Linker Hauptbronchus', 'Right main bronchus': 'Rechter Hauptbronchus',
  Liver: 'Leber', Oesophagus: 'Speiseröhre', Pancreas: 'Bauchspeicheldrüse', 'Pancreatic duct': 'Bauchspeicheldrüsengang',
  'Parotid duct': 'Ausführungsgang der Ohrspeicheldrüse', 'Parotid gland': 'Ohrspeicheldrüse', 'Pineal gland': 'Zirbeldrüse',
  Prostate: 'Prostata', 'Renal pelvis': 'Nierenbecken', 'Seminal gland': 'Bläschendrüse', 'Soft palate': 'Gaumensegel', Stomach: 'Magen',
  'Sublingual gland': 'Unterzungenspeicheldrüse', 'Submandibular duct': 'Ausführungsgang der Unterkieferdrüse',
  'Submandibular gland': 'Unterkieferspeicheldrüse', 'Suprarenal gland': 'Nebenniere', Testis: 'Hoden', 'Thyroid gland': 'Schilddrüse',
  Tongue: 'Zunge', Trachea: 'Luftröhre', Ureter: 'Harnleiter', Urethra: 'Harnröhre', 'Urinary bladder': 'Harnblase',
  'Uvula of palate': 'Zäpfchen', 'Vermiform appendix': 'Wurmfortsatz (Blinddarm)',
  // Heart and vessels
  'Right atrium': 'Rechter Vorhof', 'Left atrium': 'Linker Vorhof', 'Right ventricle': 'Rechte Herzkammer', 'Left ventricle': 'Linke Herzkammer',
  'Aortic arch': 'Aortenbogen', 'Ascending aorta': 'Aufsteigende Aorta', 'Thoracic aorta': 'Brustaorta', 'Abdominal aorta': 'Bauchaorta',
  'Pulmonary trunk': 'Lungenarterienstamm', 'Bifurcation of pulmonary trunk': 'Teilung des Lungenarterienstamms',
  'Superior vena cava': 'Obere Hohlvene', 'Inferior vena cava (abdominal part)': 'Untere Hohlvene, Bauchteil',
  'Inferior vena cava (thoracic part)': 'Untere Hohlvene, Brustteil', 'Common carotid artery': 'Gemeinsame Halsschlagader',
  'Internal carotid artery': 'Innere Halsschlagader', 'External carotid artery': 'Äußere Halsschlagader',
  'Internal jugular vein': 'Innere Drosselvene', 'External jugular vein': 'Äußere Drosselvene', 'Anterior jugular vein': 'Vordere Drosselvene',
  'Subclavian artery': 'Schlüsselbeinarterie', 'Subclavian vein': 'Schlüsselbeinvene', 'Axillary artery': 'Achselarterie', 'Axillary vein': 'Achselvene',
  'Brachial artery': 'Oberarmarterie', 'Brachial veins': 'Oberarmvenen', 'Radial artery': 'Speichenarterie', 'Ulnar artery': 'Ellenarterie',
  'Radial veins': 'Speichenvenen', 'Ulnar veins': 'Ellenvenen', 'Cephalic vein': 'Kopfvene', 'Basilic vein': 'Königsvene',
  'Median cubital vein': 'Mittlere Ellenbeugenvene', 'Femoral artery': 'Oberschenkelarterie', 'Femoral vein': 'Oberschenkelvene',
  'Deep femoral artery': 'Tiefe Oberschenkelarterie', 'Deep femoral vein': 'Tiefe Oberschenkelvene', 'Popliteal artery': 'Kniekehlenarterie',
  'Popliteal vein': 'Kniekehlenvene', 'Great saphenous vein': 'Große Rosenvene', 'Small saphenous vein': 'Kleine Rosenvene',
  'Anterior tibial artery': 'Vordere Schienbeinarterie', 'Posterior tibial artery': 'Hintere Schienbeinarterie',
  'Anterior tibial veins': 'Vordere Schienbeinvenen', 'Posterior tibial veins': 'Hintere Schienbeinvenen', 'Fibular artery': 'Wadenbeinarterie',
  'Dorsalis pedis artery': 'Fußrückenarterie', 'Common iliac artery': 'Gemeinsame Beckenarterie', 'Common iliac vein': 'Gemeinsame Beckenvene',
  'External iliac artery': 'Äußere Beckenarterie', 'External iliac vein': 'Äußere Beckenvene', 'Internal iliac artery': 'Innere Beckenarterie',
  'Internal iliac vein': 'Innere Beckenvene', 'Coeliac trunk': 'Bauchhöhlenarterienstamm', 'Renal artery': 'Nierenarterie', 'Renal vein': 'Nierenvene',
  'Hepatic portal vein': 'Pfortader', 'Hepatic veins': 'Lebervenen', 'Splenic artery': 'Milzarterie', 'Splenic vein': 'Milzvene',
  'Superior mesenteric artery': 'Obere Eingeweidearterie', 'Inferior mesenteric artery': 'Untere Eingeweidearterie',
  'Superior mesenteric vein': 'Obere Eingeweidevene', 'Inferior mesenteric vein': 'Untere Eingeweidevene',
  'Coronary artery': 'Herzkranzarterie', 'Coronary sinus': 'Koronarsinus', 'Great cardiac vein': 'Große Herzvene',
  'Middle cardiac vein': 'Mittlere Herzvene', 'Brachiocephalic trunk': 'Arm-Kopf-Arterienstamm', 'Brachiocephalic vein': 'Arm-Kopf-Vene',
  'Vertebral artery': 'Wirbelarterie', 'Vertebral vein': 'Wirbelvene', 'Basilar artery': 'Basilararterie', 'Facial artery': 'Gesichtsarterie',
  'Facial vein': 'Gesichtsvene', 'Pulmonary artery': 'Lungenarterie', 'Superior pulmonary vein': 'Obere Lungenvene',
  'Inferior pulmonary vein': 'Untere Lungenvene', 'Testicular artery': 'Hodenarterie', 'Testicular vein': 'Hodenvene',
  'Azygos vein': 'Vena azygos', 'Superior sagittal sinus': 'Oberer Längsblutleiter', 'Transverse sinus': 'Querer Blutleiter',
  'Sigmoid sinus': 'S-förmiger Blutleiter', 'Superficial palmar arch': 'Oberflächlicher Hohlhandbogen', 'Deep palmar arch': 'Tiefer Hohlhandbogen',
  'Anterior cerebral artery': 'Vordere Hirnarterie', 'Posterior cerebral artery': 'Hintere Hirnarterie',
  'Middle cerebral artery (M1-segment)': 'Mittlere Hirnarterie (M1)', 'Internal thoracic artery': 'Innere Brustkorbarterie',
  'Posterior intercostal arteries': 'Hintere Zwischenrippenarterien', 'Lumbar arteries': 'Lendenarterien', 'Lumbar veins': 'Lendenvenen',
  // Nervous system and sense organs
  'Abducens nerve (VI)': 'Augenabziehnerv (VI)', 'Accessory nerve (XI)': 'Beinerv (XI)', 'Facial nerve (VII)': 'Gesichtsnerv (VII)',
  'Glossopharyngeal nerve (IX)': 'Zungen-Rachen-Nerv (IX)', 'Hypoglossal nerve (XII)': 'Unterzungennerv (XII)',
  'Oculomotor nerve (III)': 'Augenbewegungsnerv (III)', 'Olfactory nerve (I)': 'Riechnerv (I)', 'Optic nerve (II)': 'Sehnerv (II)',
  'Trigeminal nerve (V)': 'Drillingsnerv (V)', 'Trochlear nerve (IV)': 'Augenrollnerv (IV)', 'Vagus nerve (X)': 'Vagusnerv (X)',
  'Vestibulocochlear nerve (VIII)': 'Hör- und Gleichgewichtsnerv (VIII)', 'Axillary nerve': 'Achselnerv', 'Femoral nerve': 'Oberschenkelnerv',
  'Sciatic nerve': 'Ischiasnerv', 'Median nerve': 'Mittelarmnerv', 'Ulnar nerve': 'Ellennerv', 'Radial nerve': 'Speichennerv',
  'Musculocutaneous nerve': 'Muskel-Haut-Nerv', 'Common fibular nerve': 'Gemeinsamer Wadenbeinnerv', 'Deep fibular nerve': 'Tiefer Wadenbeinnerv',
  'Superficial fibular nerve': 'Oberflächlicher Wadenbeinnerv', 'Tibial nerve': 'Schienbeinnerv', 'Obturator nerve': 'Hüftlochnerv',
  'Pudendal nerve': 'Schamnerv', 'Saphenous nerve': 'Rosennerv', 'Sural nerve': 'Wadennerv', 'Intercostal nerves': 'Zwischenrippennerven',
  'Sympathetic trunk': 'Grenzstrang', 'Ganglia of sympathetic trunk': 'Grenzstrangganglien', 'Spinal ganglion': 'Spinalganglion',
  'Cauda equina': 'Pferdeschweif (Cauda equina)', 'Corpus callosum': 'Balken', 'Medulla oblongata': 'Verlängertes Mark', Midbrain: 'Mittelhirn',
  Pons: 'Brücke', Thalamus: 'Thalamus', Hypothalamus: 'Hypothalamus', Hippocampus: 'Hippocampus', 'Amygdaloid body': 'Mandelkern',
  'Caudate nucleus': 'Schweifkern', Putamen: 'Schalenkern', 'Lentiform nucleus': 'Linsenkern', 'Lateral ventricle': 'Seitenventrikel',
  'Third ventricle': 'Dritter Ventrikel', 'Fourth ventricle': 'Vierter Ventrikel', 'Optic chiasm': 'Sehnervenkreuzung', 'Optic tract': 'Sehbahn',
  'White matter of telencephalon': 'Weiße Substanz des Großhirns', 'White matter of spinal cord': 'Weiße Substanz des Rückenmarks',
  'Anterior horn of spinal cord': 'Vorderhorn des Rückenmarks', 'Posterior horn of spinal cord': 'Hinterhorn des Rückenmarks',
  'Tonsil of cerebellum': 'Kleinhirnmandel', Cochlea: 'Hörschnecke', Cornea: 'Hornhaut', Iris: 'Regenbogenhaut', Lens: 'Linse',
  Retina: 'Netzhaut', Sclera: 'Lederhaut', 'Vitreous body': 'Glaskörper', 'Tympanic membrane': 'Trommelfell', 'Auditory tube': 'Ohrtrompete',
  Vestibule: 'Vorhof (Innenohr)', 'Lacrimal gland': 'Tränendrüse', 'Lacrimal sac': 'Tränensack', 'Nasolacrimal duct': 'Tränen-Nasen-Gang',
  // Lymphoid organs
  Spleen: 'Milz', 'Left lobe of thymus': 'Thymus, linker Lappen', 'Right lobe of thymus': 'Thymus, rechter Lappen', 'Palatine tonsil': 'Gaumenmandel',
  // Skin (regions)
  'Hairs of head': 'Kopfhaar', 'Hairs of eyebrow': 'Augenbrauenhaare', Eyebrow: 'Augenbraue', Eyelashes: 'Wimpern', 'Pubic hairs': 'Schamhaare',
  'Nail plate': 'Fingernagel', 'Nail plate (foot)': 'Zehennagel', Helix: 'Ohrleiste', 'Dorsum of hand': 'Handrücken', 'Dorsum of foot': 'Fußrücken',
  'Heel region': 'Ferse', 'Gluteal region': 'Gesäß', 'Frontal region': 'Stirn', 'Cubital fossa': 'Ellenbeuge', 'Popliteal fossa': 'Kniekehle',
  'Umbilical region': 'Nabelgegend', 'Palm': 'Handfläche', 'Sole': 'Fußsohle',
};

const FINGER = n => n === 1 ? 'des Daumens' : `des ${n}. Fingers`;
const TOE = n => n === 1 ? 'der Großzehe' : `der ${n}. Zehe`;
const PHAL = { Proximal: 'Grundglied', Middle: 'Mittelglied', Distal: 'Endglied' };
const TOOTH = { 'medial incisor': 'mittlerer Schneidezahn', 'lateral incisor': 'seitlicher Schneidezahn', canine: 'Eckzahn',
  'first premolar': 'erster kleiner Backenzahn', 'second premolar': 'zweiter kleiner Backenzahn',
  'first molar tooth': 'erster großer Backenzahn', 'second molar tooth': 'zweiter großer Backenzahn' };
const VERT = { C: 'Halswirbel', T: 'Brustwirbel', L: 'Lendenwirbel' };

/** German name for an English Z-Anatomy name, or null (then the app shows the Latin name) */
export function germanName(en) {
  if (DICT[en]) return DICT[en];
  let m;
  if ((m = en.match(/^(\w+) rib$/)) && ORD[m[1].toLowerCase()]) return `${ORD[m[1].toLowerCase()]}. Rippe`;
  if ((m = en.match(/^Costal cartilage of (\w+) rib$/)) && ORD[m[1]]) return `Rippenknorpel der ${ORD[m[1]]}. Rippe`;
  if ((m = en.match(/^(\w+) metacarpal bone$/)) && ORD[m[1].toLowerCase()]) return `${ORD[m[1].toLowerCase()]}. Mittelhandknochen`;
  if ((m = en.match(/^(\w+) metatarsal bone$/)) && ORD[m[1].toLowerCase()]) return `${ORD[m[1].toLowerCase()]}. Mittelfußknochen`;
  if ((m = en.match(/^(Proximal|Middle|Distal) phalanx of (\w+) finger of (hand|foot)$/)) && ORD[m[2]])
    return `${PHAL[m[1]]} ${m[3] === 'hand' ? FINGER(ORD[m[2]]) : TOE(ORD[m[2]])}`;
  if ((m = en.match(/^(Upper|Lower) (.+)$/)) && TOOTH[m[2]]) return `${m[1] === 'Upper' ? 'Oberer' : 'Unterer'} ${TOOTH[m[2]]}`;
  if ((m = en.match(/^Vertebra ([CTL])(\d+)$/))) return `${m[2]}. ${VERT[m[1]]} (${m[1]}${m[2]})`;
  if ((m = en.match(/^(Right|Left) (.+)$/)) && DICT[m[2][0].toUpperCase() + m[2].slice(1)])
    return `${DICT[m[2][0].toUpperCase() + m[2].slice(1)]} (${m[1] === 'Right' ? 'rechts' : 'links'})`;
  if ((m = en.match(/segmental bronchus of (left|right) lung \((B[IVX+]+)\)$/))) return `Segmentbronchus ${m[2]} der ${m[1] === 'left' ? 'linken' : 'rechten'} Lunge`;
  if (/ nodes?$/.test(en)) return 'Lymphknoten';
  return null;
}
