import { Item, User, publicItem, today } from '../../src/webparts/lostFoundStudent/app/model';
import { Repository, Row, Table } from '../../src/webparts/lostFoundStudent/app/service';

type Database = Record<Table,Row[]>;
export const TEST_DATABASE_KEY='lost-found-no-qr-test-harness-v1';
export const DEMO_STUDENT: User={id:'student-1',name:'山田 花子',email:'s260001@stu.kobe-u.ac.jp',role:'student'};
export const DEMO_STAFF: User={id:'staff-1',name:'農学部 窓口担当',email:'staff@example.invalid',role:'staff'};

export function seedDatabase(): Database {
  const base={colors:['黒'],campus:'C02',building:'',place:'農学部 食堂付近',foundOn:today(),window:'農学部事務室',feature:'',valuable:false,status:'保管中',createdAt:new Date().toISOString()} as const;
  const values: Item[]=[
    {...base,id:'1',parent:'P05',category:'P05_UMBRELLA_LONG',title:'長傘',colors:['黒','白'],feature:'持ち手が木製、白い縁取り'},
    {...base,id:'2',parent:'P07',category:'P07_BOTTLE',title:'水筒・タンブラー・シェーカー',colors:['青','銀'],feature:'青い本体に銀色のふた',place:'図書館入口'},
    {...base,id:'3',parent:'P06',category:'P06_PENCIL_CASE',title:'ペンケース',colors:['茶'],feature:'布製のペンケース'},
    {...base,id:'4',parent:'P01',category:'P01_WALLET',title:'財布',colors:['黒'],valuable:true,feature:'黒い二つ折り財布'},
    {...base,id:'5',parent:'P02',category:'P02_EARPHONE_WIRELESS',title:'ワイヤレスイヤホン',colors:['白'],feature:'白いケース付き'},
  ];
  return {items:values.map(v=>({id:v.id,author:DEMO_STAFF.id,etag:'1',value:{...v}})),public:values.filter(v=>!v.valuable).map(v=>({id:v.id,author:DEMO_STAFF.id,etag:'1',value:{...publicItem(v),sourceId:v.id}})),profiles:[{id:'1',author:DEMO_STAFF.id,etag:'1',value:{email:DEMO_STAFF.email,window:'農学部事務室'}}],requests:[],claims:[],notices:[],thanks:[],publicThanks:[],mail:[]};
}

export class DemoRepository implements Repository {
  public constructor(public user: User) { if(!localStorage.getItem(TEST_DATABASE_KEY)) localStorage.setItem(TEST_DATABASE_KEY,JSON.stringify(seedDatabase())); }
  private read(): Database { return JSON.parse(localStorage.getItem(TEST_DATABASE_KEY) || '{}') as Database; }
  public async list(table: Table): Promise<Row[]> {
    const rows=this.read()[table] || [];
    if(this.user.role==='staff') return rows;
    if(['items','mail'].includes(table)) throw new Error('職員専用です。');
    if(['profiles','requests','claims','thanks'].includes(table)) return rows.filter(r=>r.author===this.user.id);
    if(table==='notices') return rows.filter(r=>r.value.owner===this.user.id);
    return rows;
  }
  public async put(table: Table,value: object,id?: string,etag?: string): Promise<string> {
    const db=this.read(); const rows=db[table]; const index=rows.findIndex(r=>r.id===id);
    if(this.user.role==='student' && !['profiles','requests','claims','thanks'].includes(table)) throw new Error('職員専用です。');
    if(id && (index<0 || rows[index].etag!==etag || (this.user.role==='student' && rows[index].author!==this.user.id))) throw new Error('データが更新されました。再読込してください。');
    const row: Row={id:id || String(Math.max(0,...rows.map(r=>Number(r.id)))+1),author:index>=0?rows[index].author:this.user.id,etag:String(index>=0?Number(rows[index].etag)+1:1),value:{...value}};
    if(index>=0) rows[index]=row; else rows.push(row);
    localStorage.setItem(TEST_DATABASE_KEY,JSON.stringify(db)); return row.id;
  }
  public async remove(table: Table,id: string): Promise<void> { if(this.user.role!=='staff') throw new Error('職員専用です。'); const db=this.read(); db[table]=db[table].filter(r=>r.id!==id); localStorage.setItem(TEST_DATABASE_KEY,JSON.stringify(db)); }
  public async grantNotice(_id: string,_owner: string): Promise<void> { /* Test harness only: list() enforces recipient scope. */ }
}
