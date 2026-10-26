// Calories/protein: user's supplied estimates. Other macros are independent,
// explicitly sourced estimates, never inferred from the energy difference.
export const FOOD_GROUPS = ['Nasi & mi', 'Lauk', 'Sayur', 'Extras'];
export const TKPI_URL = 'https://lib.poltekkespalembang.ac.id/index.php?bid=15003&fid=94&p=fstream-pdf';
export const USDA_EGG_URL = 'https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg01.pdf#page=384';
export const USDA_RICE_URL = 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg20.pdf#page=325';
const seeds = [
  ['rice','Nasi putih','Nasi & mi','100 g cooked',100,'g',130,2.5,28.17,.28,'USDA SR28 NDB 20045, white long-grain rice cooked, per 100 g. Reference preparation matches the supplied 130 kcal basis more closely than TKPI AP001 (180 kcal); water content varies.',USDA_RICE_URL],
  ['chicken','Ayam goreng','Lauk','1 leg quarter',null,null,470,40],
  ['tongkol','Tongkol balado','Lauk','100 g prepared',100,'g',220,25],
  ['kembung','Ikan kembung goreng','Lauk','1 serving (weight unspecified)',null,null,250,25],
  ['bawal','Ikan bawal goreng','Lauk','1 serving (weight unspecified)',null,null,300,28],
  ['nila','Ikan nila goreng','Lauk','1 serving (weight unspecified)',null,null,270,31],
  ['squid','Cumi tumis','Lauk','100 g prepared',100,'g',170,18],
  ['offal','Ati ampela balado','Lauk','100 g prepared',100,'g',220,23],
  ['balado-egg','Telur balado','Lauk','1 egg',null,null,130,6.5],
  ['egg','Telur rebus','Lauk','1 egg (large reference)',50,'g',78,6.3,.56,5.305,'USDA SR28 NDB 01129: 1 large hard-boiled egg, 50 g edible portion; 1.12 g carbohydrate and 10.61 g fat per 100 g. Egg size varies.',USDA_EGG_URL],
  ['tempe','Tempe orek','Lauk','50 g prepared',50,'g',160,8],
  ['eggplant','Terong balado','Sayur','100 g prepared',100,'g',170,2],
  ['beans','Sayur kacang panjang','Sayur','1 serving (weight unspecified)',null,null,90,3],
  ['greens','Sayur bayam / asem','Sayur','1 serving (weight unspecified)',null,null,45,2],
  ['milk','Susu full cream','Extras','250 ml',250,'ml',155,8,10.75,8.75,'TKPI 2017 JR006 cow milk: 4.3 g carbohydrate, 3.5 g fat per 100 g. Approximation assumes 250 ml ≈ 250 g; use the actual package label when available.',TKPI_URL],
  ['banana','Pisang','Extras','1 banana (size unspecified)',null,null,105,1.3],
  ['fried-rice','Nasi goreng','Nasi & mi','1 plate',null,null,650,15],
  ['noodles','Mie ayam','Nasi & mi','1 bowl',null,null,500,20],
  ['satay','Sate ayam','Lauk','10 skewers with sauce',null,null,550,35]
];
export const SEED_FOODS = seeds.map(([key,name,group,portion,baseAmount,baseUnit,calories,protein,carbs=null,fat=null,macroNote='',macroUrl='']) => ({
  id:`food-${key}`,name,group,portion,baseAmount,baseUnit,calories,protein,carbs,fat,archived:false,
  source:'Calories/protein: supplied personal estimates. Portions and preparation vary.',
  macroNote:macroNote || 'Carbohydrate/fat unknown: no suitable prepared-food/portion match established.',macroUrl
}));
