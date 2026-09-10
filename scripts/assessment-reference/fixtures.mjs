export const f=key=>({op:'FACT',key});
export const not=key=>({op:'NOT',arg:f(key)});
export const all=(...keys)=>({op:'ALL',args:keys.map(f)});
export function problem(){return {
 publicationId:'matching.demo.v0.3',
 snapshot:{id:'SYNTHETIC_A_B',revision:1,permissionRevision:1,context:'possible-cohabitation:week-example',mode:'MATCHING',gate:'AVAILABLE',values:{always:'T',sameParenthood:'T',sameFormat:'T',BfullCycle:'F',BoffersShopping:'T',AoffersCooking:'T',AfullCycle:'T',timeFits:'T',Bautonomy:'T'}},
 factDefinitions:[
 {id:'always',kind:'FIXED_POSITION',owner:'JOINT',domain:'D03'},
 {id:'sameParenthood',kind:'FIXED_POSITION',owner:'JOINT',domain:'D03'},
 {id:'sameFormat',kind:'FIXED_POSITION',owner:'JOINT',domain:'D03'},
 {id:'BfullCycle',kind:'SKILL',owner:'B',domain:'D01'},
 {id:'BoffersShopping',kind:'OFFER',owner:'B',domain:'D01'},
 {id:'AoffersCooking',kind:'OFFER',owner:'A',domain:'D01'},
 {id:'AfullCycle',kind:'SKILL',owner:'A',domain:'D01'},
 {id:'timeFits',kind:'COORDINATION',owner:'JOINT',domain:'D09'},
 {id:'Bautonomy',kind:'BOUNDARY',owner:'B',domain:'D08'}],
 requirements:[
 {id:'parenthood',domain:'D03',direction:'BOTH',tier:'MUST',predicate:f('sameParenthood')},
 {id:'relationshipFormat',domain:'D03',direction:'BOTH',tier:'MUST',predicate:f('sameFormat')},
 {id:'A_need_shopping_cycle',domain:'D01',direction:'A_FROM_B',tier:'MUST',predicate:all('BfullCycle','BoffersShopping')},
 {id:'B_need_cooking_cycle',domain:'D01',direction:'B_FROM_A',tier:'MUST',predicate:all('AfullCycle','AoffersCooking')},
 {id:'mutualTime',domain:'D09',direction:'BOTH',tier:'IMPORTANT',predicate:f('timeFits')},
 {id:'B_personalTime',domain:'D08',direction:'B_FROM_A',tier:'MUST',predicate:f('Bautonomy')}],
 resources:[{id:'A_minutes',owner:'A',unit:'minute',period:'week-example',capacity:300},{id:'B_minutes',owner:'B',unit:'minute',period:'week-example',capacity:300}],
 configurations:[{id:'A_cooks_B_shops',choices:{},precondition:f('always'),use:{A_minutes:180,B_minutes:180}}],
 worldConstraints:[],
 changes:[{id:'B_demonstrates_full_cycle',label:'B достигает критерия полного цикла в отдельном наблюдении',owners:['B'],effects:{BfullCycle:'T'},precondition:f('always'),costs:{B_minutes:90},willingness:{A:'U',B:'T'},prerequisites:[],verification:'Новое подходящее наблюдение применения; 90 минут — выбранный бюджет попытки, не срок гарантированного обучения',interpretation:'ASSUMED_OUTCOME_NOT_FORECAST'}],
 target:{importantNumerator:1,importantDenominator:1,status:'AUTHOR_POLICY_NOT_VALIDATED'}
};}
export function withTwoBarriers(){const p=problem();p.snapshot.values.timeFits='F';p.changes.push({id:'joint_schedule',label:'Выбран допустимый обоим новый общий интервал',owners:['A','B'],effects:{timeFits:'T'},precondition:f('always'),costs:{A_minutes:15,B_minutes:15},willingness:{A:'T',B:'T'},prerequisites:[],verification:'Оба независимо подтвердили конкретный интервал; старые прочие ограничения не менялись',interpretation:'ASSUMED_OUTCOME_NOT_FORECAST'});return p;}
export function worldDependent(){return {
 publicationId:'quantifier-test',snapshot:{id:'worlds',revision:1,permissionRevision:1,context:'test',mode:'MATCHING',gate:'AVAILABLE',values:{always:'T',unknownDay:'U'}},
 factDefinitions:[{id:'always',kind:'FIXED_POSITION',owner:'JOINT',domain:'D03'},{id:'unknownDay',kind:'RESOURCE_CONDITION',owner:'A',domain:'D09'},{id:'chooseEarly',kind:'PLAN',owner:'JOINT',domain:'D09'}],
 requirements:[{id:'sameDay',domain:'D09',direction:'BOTH',tier:'MUST',predicate:{op:'ANY',args:[all('chooseEarly','unknownDay'),{op:'ALL',args:[not('chooseEarly'),not('unknownDay')]}]}}],
 resources:[],configurations:[{id:'early',choices:{chooseEarly:'T'},precondition:f('always'),use:{}},{id:'late',choices:{chooseEarly:'F'},precondition:f('always'),use:{}}],worldConstraints:[],changes:[],target:{importantNumerator:1,importantDenominator:1,status:'AUTHOR_POLICY_NOT_VALIDATED'}
};}
