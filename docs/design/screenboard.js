'use strict';
// Local, deterministic interaction demo. No model, network, or job execution.
const scenarios = {
  "system": {
    "title": "销售穿行系统",
    "sub": "审计项目 / 开发系统",
    "type": "开发系统",
    "state": "工程设计中",
    "user": "把这些杂乱的销售文档整理成可追溯的勾稽链条。需要解析文档、输出校验规则，并给出符合哪些审计标准的报告。",
    "reply": "PRD 与界面方案已确认。现在让架构师和测试 Agent 同步做工程设计：先把证据、规则和报告之间的关系定义清楚，再进入研发。",
    "plan": "工程设计",
    "steps": "研究 / PRD　✓　UI/UX　✓　宣讲　✓　<b>工程设计</b>　→　研发测试　→　验收发布",
    "run": "2 个 Agent 正在执行 · 1 个等待依赖",
    "activity": "架构师正在定义证据链数据模型；测试 Agent 正在整理异常样例。",
    "a": "系统分析设计",
    "b": "测试分析设计"
  },
  "ipo": {
    "title": "IPO 审计",
    "sub": "审计项目 / 开发系统",
    "type": "开发系统",
    "state": "待梳理需求",
    "user": "在审计项目中开展 IPO 审计相关工作。",
    "reply": "先明确此次工作的目标、适用范围和交付物，再选择需要加载的流程和技能。当前仅展示项目归属，不预设具体审计要求。",
    "plan": "需求梳理",
    "steps": "<b>明确目标与范围</b>　→　确定交付物　→　制定计划",
    "run": "尚未启动 · 当前没有活跃 Agent",
    "activity": "IPO 审计与销售穿行属于同一个审计项目，各自保留工作对话和成果。",
    "a": "需求范围 · 待整理",
    "b": "交付清单 · 待明确"
  },
  "passport": {
    "title": "护照校验系统",
    "sub": "护照校验项目 / 开发系统",
    "type": "开发系统",
    "state": "等待范围确认",
    "user": "客户会传来一张带人脸的护照页图片，需要判断它是不是假的。",
    "reply": "我会先研究单张图片能支持哪些判断。图片篡改风险、版式异常和证件真伪不是同一个结论，先明确输出边界，再让团队设计系统。",
    "plan": "研究与需求范围",
    "steps": "<b>研究 / PRD</b>　→　UI/UX　→　工程设计　→　研发测试",
    "run": "待你确认 · 当前没有活跃 Agent",
    "activity": "建议输出可疑点与证据不足状态；正式范围需在 PRD 审阅卡确认。",
    "a": "能力范围研究",
    "b": "待确认问题"
  },
  "skill": {
    "title": "Ontology 技能组",
    "sub": "知识与分享 / 制作 Skill",
    "type": "制作 Skill",
    "state": "待审阅",
    "user": "把从模糊需求开展 ontology 分析的方法做成一组可复用技能。",
    "reply": "8 个技能的草稿已整理成一个版本化技能组。每个技能说明输入、输出和适用范围；下一步审阅组内依赖与验证结果。",
    "plan": "技能组审阅",
    "steps": "需求　✓　调研　✓　编写　✓　验证　→　<b>审阅</b>",
    "run": "无活跃 Agent · 等待技能组审阅",
    "activity": "这里的数量和状态仅演示界面，不表示真实技能已经生成或验证。",
    "a": "Ontology 技能组",
    "b": "技能验证报告"
  },
  "document": {
    "title": "小白 CI/CD 经验分享",
    "sub": "知识与分享 / 写文档",
    "type": "写文档",
    "state": "正文修订中",
    "user": "整理一份小白也能看懂的 CI/CD 经验分享，讲清楚我遇到的问题和解决办法。",
    "reply": "我会保留你提供的真实经历，把流水线概念放在具体例子里解释。写作 Agent 正在调整内容，缺少原始经历的部分会标为待补充。",
    "plan": "正文与来源核查",
    "steps": "需求　✓　大纲　✓　<b>正文修订</b>　→　核查　→　审阅",
    "run": "1 个 Agent 正在执行",
    "activity": "写作 Agent：将部署失败案例改写为步骤和排查清单。",
    "a": "经验分享 · 草稿",
    "b": "来源与待补充项"
  },
  "presentation": {
    "title": "把经验分享做成 PPT",
    "sub": "扩展示例 / 规划中的工作包",
    "type": "写 PPT · 规划中",
    "state": "尚不可启动",
    "user": "把这份 CI/CD 经验分享做成面向新人培训的 PPT，保留可编辑版本和讲稿。",
    "reply": "这是一种新的工作类型，仍使用这条对话、执行详情和成果预览。接入 PPTX 生成与渲染能力后，替身才能按下面的流程工作；当前仅展示扩展方案。",
    "plan": "拟议 PPT 工作流程",
    "steps": "需求　→　故事线　→　逐页内容　→　排版渲染　→　审阅",
    "run": "缺少 2 项能力 · 没有真实执行",
    "activity": "需要接入 pptx.generate 与 pptx.render，并通过可编辑性和页面渲染检查。",
    "a": "故事线 · 示例",
    "b": "页面预览 · 示例"
  }
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const groups = [{name:'审计项目',keys:['system','ipo']},{name:'护照校验项目',keys:['passport']},{name:'知识与分享',keys:['skill','document']},{name:'扩展示例',keys:['presentation']}];
const meta = {
 system:{project:'审计项目',tagline:'从需求到验收，让每次修改都有着落。',english:'SYSTEM DEVELOPMENT',number:'01',short:'工程设计 · 2 个智能体',count:2,jobs:1,phase:3,stages:['研究 / PRD','UI / UX','团队宣讲','工程设计','研发测试','验收发布'],files:['产品需求规格 v3.md','交互设计方案 v2.html','合成销售单据样本.csv']},
 ipo:{project:'审计项目',tagline:'从业务范围开始，建立清晰的审计路径。',english:'SYSTEM DEVELOPMENT',number:'02',short:'待梳理需求',count:0,jobs:0,phase:0,stages:['明确范围','确定交付','制定计划'],files:[]},
 passport:{project:'护照校验项目',tagline:'先明确可信边界，再设计校验系统。',english:'SYSTEM DEVELOPMENT',number:'03',short:'需要你确认范围',count:0,jobs:0,phase:0,stages:['研究 / PRD','UI / UX','工程设计','研发测试'],files:['需求说明.md']},
 skill:{project:'知识与分享',tagline:'把一次研究，沉淀为可重复使用的能力。',english:'SKILL AUTHORING',number:'04',short:'8 个技能草稿 · 待审阅',count:0,jobs:0,phase:4,stages:['明确需求','资料研究','编写技能','验证','审阅'],files:['Ontology 研究笔记.md','技能依赖草案.md']},
 document:{project:'知识与分享',tagline:'让真实的经验，成为别人可以走通的路。',english:'DOCUMENT WRITING',number:'05',short:'正文修订中',count:1,jobs:0,phase:2,stages:['明确需求','内容大纲','正文修订','证据核查','审阅'],files:['CI-CD 经验笔记.md']},
 presentation:{project:'扩展示例',tagline:'新的工作类型，同一个与你协作的替身。',english:'PRESENTATION · COMING LATER',number:'06',short:'规划中 · 不可启动',count:0,jobs:0,phase:0,stages:['需求','故事线','逐页内容','排版渲染','审阅'],files:['CI-CD 经验分享.md']}
};
scenarios.system.reply='PRD 与界面方案已确认。我正在组织工程设计：架构师梳理证据链，测试 Agent 同步设计异常样例。等两份设计对齐，再交给开发。';
scenarios.system.activity='接下来：对齐架构与测试设计，提交工程基线审阅。';
let current='system',screen=null,selectedAgent='architect',panel=null,lastTrigger=null,newType='system',slideIndex=0;
const state={};
for(const k of Object.keys(scenarios)) state[k]={draft:'',messages:[],paused:false,target:null,scroll:null};

// Personal AI is an inspectable design fixture, not inferred/stored user data.
const personalDemo={candidate:'proposed'};
const viewCatalog={evidence:'依据核查',scope:'范围澄清',method:'方法验证',sources:'来源核查',change:'变更复核',handoff:'交接检查'};
function personalApplicable(){return !state[current].personalOff;}
function contextSelection(){
 const changed=state[current].deliveryChanged;
 const suggested=changed?'change':current.startsWith('draft-')?'scope':current==='system'?'evidence':['passport','ipo'].includes(current)?'scope':current==='skill'?'method':current==='presentation'?'handoff':'sources';
 const component=state[current].pinnedComponent||suggested;
 return {component,suggested,changed,personal:personalApplicable(),pinned:!!state[current].pinnedComponent};
}
function personalPanel(){const on=personalApplicable();return `<div class="inspector-eyebrow">PERSONAL AI / 工作准则 · 演示副本</div><article class="paper personal-paper"><div class="paper-label">属于你的方法，由你确认和控制</div><h2>记住怎样工作，<br>说清为什么使用。</h2><p class="sample-label">来自本对话中你明示的工作习惯；未写入真实长期记忆。</p><div class="personal-use"><div><strong>${on?'本次参考个人准则':'本次暂停个人准则'}</strong><p>${on?'只使用适合当前任务的准则。项目权限和验收仍单独核对。':'新推荐仅参考工作状态；不删除准则，不改变交付要求。'}</p></div><button data-action="personal-toggle" aria-pressed="${on}">${on?'本次暂停':'恢复使用'}</button></div><section class="memory-entry"><div><span class="badge green">你已明示</span><small>个人 · 系统研发</small></div><h3>先研究，再设计，再研发与验收</h3><p>研究/PRD → UIUX → 团队宣讲 → 工程与测试设计 → 研发测试循环 → 综合审核。</p><details><summary>查看来源与使用边界</summary><p>来源：你在本对话描述的五阶段工作习惯。适用于系统研发；短文不强制走完整流程。当前${on&&scenarios[current].type==='开发系统'?'可参考此方法':'不用于扩张本工作流程'}。</p></details></section><section class="memory-entry"><div><span class="badge green">你已明示</span><small>个人 · 修改交付</small></div><h3>修改检查完成后直接本地提交</h3><p>来源：你明确要求每次修改完直接提交。该偏好不包含推送、合并或生产发布授权。</p></section><section class="memory-entry project-memory"><div><span class="badge">项目隔离</span><small>${esc(meta[current].project)}</small></div><h3>业务约束只在所属项目使用</h3><p>${current==='passport'?'护照支持范围与效果样本待确认；不带入审计规则或容差。':['system','ipo'].includes(current)?'审计范围与规则仍待项目确认，不作为个人全局准则。':'只引用本工作包材料；客户业务规则不成为通用写作偏好。'}</p></section><section class="learning-candidate"><span class="delivery-eyebrow">METHOD CANDIDATE · 合成复盘</span><h3>报告声明先对应到原始记录</h3><p>建议加入方法验证，覆盖缺记录、记录过期及正常样例。尚未通过回归检查，不能作为有效技能启用。</p><span class="candidate-status" role="status">${personalDemo.candidate==='proposed'?'待你判断 · 尚未使用':personalDemo.candidate==='accepted'?'已接受候选 · 待验证，尚未启用':'已忽略 · 不参与推荐'}</span>${personalDemo.candidate==='proposed'?'<div class="candidate-actions"><button class="detail-action" data-action="candidate-accept">加入验证清单</button><button class="quiet-action" data-action="candidate-ignore">暂不采用</button></div>':'<button class="quiet-action" data-action="candidate-reset">重置候选演示</button>'}</section><p class="note">以上状态只保留在本页内存。纠正、遗忘、持久导出与真实学习属于后续实现，本演示不假装已经完成。</p></article>`;}
function intelligentPanel(){const v=contextSelection();return `<div class="inspector-eyebrow">INTELLIGENT UI / 本次推荐依据</div><article class="paper intelligent-paper"><div class="paper-label">界面随问题适配，控制权一直在你</div><h2>为什么现在<br>显示${viewCatalog[v.component]}？</h2><div class="view-reason"><span>01 / 当前任务</span><strong>${esc(scenarios[current].title)}</strong><p>${esc(brief()[1])}</p></div><div class="view-reason"><span>02 / 可核对的状态</span><strong>${v.changed?'上游约定已经修改，旧验证不能支持新要求':'交付约定仍有缺口，需要先核对当前依据'}</strong><p>使用本工作项的合成状态；没有读取其他项目的客户材料。</p></div><div class="view-reason"><span>03 / 个人工作方式</span><strong>${v.personal?'参考适用的明确准则':'本次个人准则已暂停'}</strong><p>${v.personal?'以关键审阅与可追溯交付为组织方向；新推断仅作候选。':'推荐只依赖当前任务与交付状态；不改变审批和验收要求。'}</p></div><div class="view-policy"><strong>${v.pinned?'当前检查点已固定':'当前按情境推荐检查点'}</strong><p>${v.pinned?'保持当前组件，但新变更仍更新状态和阻断提示。':'缺依据时核查来源，需求变更时检查影响；阅读和输入不被自动切换打断。'}</p><button class="detail-action" data-action="view-pin">${v.pinned?'恢复情境推荐':'固定当前检查点'}</button></div><div class="delivery-verdict">固定显示或个人偏好都不能将未通过的交付改成已通过。</div><button class="quiet-action" data-action="personal-open">查看或暂停个人准则 ${icon('arrow')}</button><p class="note">本页使用确定性规则演示情境适配，未调用模型生成界面。正式实现只使用经过审核的组件目录。</p></article>`;}

let toastTimer, paletteIndex=0;
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function nav(){
 $('#project-nav').innerHTML=groups.map((g,i)=>`<div class="project-group"><button class="project-label" data-group="${i}" aria-expanded="true">${icon('folder')}${esc(g.name)}<svg class="fold" aria-hidden="true"><use href="#i-chevron"/></svg></button><div id="group-${i}">${g.keys.map(k=>`<button class="tasknav ${current===k&&screen==='UI-02'?'active':''}" data-task="${k}" data-short="${esc(({system:"销",ipo:"IPO",passport:"护",skill:"S",document:"文",presentation:"P"})[k]||"新")}" title="${esc(scenarios[k].title)}" aria-label="${esc(g.name+'：'+scenarios[k].title)}" ${current===k&&screen==='UI-02'?'aria-current="page"':''}><span class="task-symbol" aria-hidden="true"></span><span><strong>${esc(scenarios[k].title)}</strong><small>${esc(meta[k].short)}</small></span></button>`).join('')}</div></div>`).join('');
}
function saveDraft(){if(screen==='UI-02'){state[current].draft=$('#input').value;state[current].scroll=$('#timeline').scrollTop;}}
function closePanel(restore=true){
 const el=$('#UI-03');if(el.hidden)return;
 el.hidden=true;el.classList.remove('wide');panel=null;setBackgroundInert(false);el.removeAttribute('role');el.removeAttribute('aria-modal');el.removeAttribute('aria-labelledby');
 $$('[data-inspect],.personal-chip,[data-action="ui-explain"]').forEach(b=>b.setAttribute('aria-expanded','false'));
 if(restore&&lastTrigger){const replacement=lastTrigger.isConnected?lastTrigger:lastTrigger.dataset.inspect?document.querySelector(`[data-inspect="${lastTrigger.dataset.inspect}"]`):lastTrigger.dataset.action?document.querySelector(`[data-action="${lastTrigger.dataset.action}"]`):null;replacement?.focus();}
}
function setScreen(id){saveDraft();closePanel(false);screen=id;['UI-01','UI-02','UI-04','UI-05'].forEach(x=>$('#'+x).hidden=x!==id);if(id!=='UI-02')$('#breadcrumb').textContent={ 'UI-01':'个人工作区 / 新工作','UI-04':'个人工作区 / 能力库','UI-05':'个人工作区 / 设置'}[id];nav();}
function activity(){renderOutcome();const personalLabel=$('.personal-chip span');if(personalLabel)personalLabel.textContent=personalApplicable()?'按你的方式':'准则已暂停';const m=meta[current],st=state[current],a=st.paused?0:m.count,j=st.paused?0:m.jobs;
 $('#activitybar').innerHTML=`<span class="scope">当前工作</span><button data-inspect="execution" aria-expanded="${panel==='execution'}" aria-controls="UI-03">${icon('agent')}<b>${a}</b> 个智能体工作中</button><button data-inspect="jobs" aria-expanded="${panel==='jobs'}" aria-controls="UI-03">${icon('terminal')}<b>${j}</b> 个后台 Job</button><span class="health"><i class="status-dot" style="${a?'':'background:#9a8ca9'}"></i>${st.paused?'已暂停 · 演示':a?'当前阶段进行中':'等待下一步'}</span>`;
 $('#pause').disabled=!m.count;$('#pause').innerHTML=icon(st.paused?'play':'pause')+`<span>${st.paused?'继续':'暂停'}</span>`;$('#pause').setAttribute('aria-label',st.paused?'继续演示':'暂停演示');
 $('#send').disabled=current==='presentation'||!$('#input').value.trim();
 $('#input-status').textContent=current==='presentation'?'规划中的工作包 · 暂不可运行':st.paused?'演示已暂停 · 补充将保留在队列':'补充将在下一个安全边界应用';
}
function stageCard(){const d=scenarios[current],m=meta[current];return `<section class="stage-card" aria-label="工作阶段"><div class="stage-card-head"><div class="stage-title"><span class="stage-number">${String(m.phase+1).padStart(2,'0')}</span><div><strong>${esc(d.plan)}</strong><small>${esc(state[current].paused?'已暂停 · 演示':d.state)} · 第 ${m.phase+1} / ${m.stages.length} 阶段</small></div></div><button class="text-button" data-inspect="plan">完整计划 ${icon('chevron')}</button></div></section>`;}

function relay(){if(current!=='system')return '';const paused=state[current].paused;return `<section class="team-relay" aria-label="协作中的智能体"><div class="relay-label"><span>替身协作 / 工程设计</span><strong>${paused?'已暂停':'架构与测试同步推进'}</strong></div><div class="relay-people"><button class="person" data-agent="architect"><span class="person-initial">A</span><span><strong>架构师</strong><small>${paused?'已暂停':'定义证据链模型'}</small></span></button><button class="person tester" data-agent="tester"><span class="person-initial">T</span><span><strong>测试 Agent</strong><small>${paused?'已暂停':'整理异常样例'}</small></span></button><span class="relay-arrow" aria-hidden="true">→</span><button class="person pending" data-agent="developer"><span class="person-initial">D</span><span><strong>开发 Agent</strong><small>等待工程基线</small></span></button></div></section>`;}
function artifacts(){const d=scenarios[current];return `<div class="artifact-heading"><span>这一步的成果</span><span>草稿 · 示例内容</span></div><div class="artifact-grid">${[d.a,d.b].map((t,i)=>`<button class="artifact-card" data-inspect="${i?'secondary':'artifact'}"><div class="artifact-art ${i?'test':''}" aria-hidden="true">${i?'<div class="check-lines"><i></i><i></i><i></i></div>':'<span class="diagram-node"></span><span class="diagram-line"></span><span class="diagram-node"></span><span class="diagram-line"></span><span class="diagram-node"></span>'}<span class="document-stamp">${i?'VERIFY':'DESIGN'}</span></div><div class="artifact-info"><strong>${esc(t)}${icon('arrow')}</strong><p><span>${i?'检查与依据':'内容与版本'}</span><span>打开阅读</span></p></div></button>`).join('')}</div>`;}

// S1: in-memory delivery example. No runtime result or approval is created.
const deliveryBriefs={
 system:['还有 2 条约定未满足','工程设计中 · 等待审阅与补充依据','先对齐规则设计，再建立工程基线'],
 passport:['先明确校验的可信边界','研究阶段 · 输出范围待确认','确定单张图片能支持的结论'],
 ipo:['先约定这次要交付什么','需求阶段 · 范围与依据待补充','明确适用期间、范围与交付对象'],
 skill:['技能组等待整体审阅','8 个技能草稿 · 验证与依赖待审阅','检查正反例和组内依赖'],
 document:['正文仍有待补充的依据','正文修订中 · 真实经历待补充','补齐部署失败案例的原始记录'],
 presentation:['PPT 工作包尚不可运行','扩展设计 · 缺生成与渲染能力','查看扩展边界和示例成果']
};
function brief(){return state[current].deliveryChanged?['3 项成果需要重新核对','约定 v2 草稿 · 旧依据已失效','修订规则与接口，重新验证后审阅']:deliveryBriefs[current]||['交付约定尚待整理','演示草稿 · 未启动','先明确输出、范围和检查方式'];}
function renderOutcome(){const b=brief(),changed=state[current].deliveryChanged;$('#delivery-summary').innerHTML=`<div class="outcome-emblem" aria-hidden="true"><i></i><i></i><i class="${changed?'changed':''}"></i></div><div class="outcome-copy"><span>交付状态 <small>／ 示例</small></span><strong>${esc(b[0])}</strong></div><p>${esc(b[1])}</p><button class="outcome-button" data-inspect="delivery" aria-controls="UI-03" aria-expanded="${panel==='delivery'}">查看约定 ${icon('arrow')}</button>`;}
function deliveryCard(){const b=brief(),v=contextSelection();const headlines={evidence:'先对齐规则设计，再建立工程基线',scope:'先明确范围和可信边界',method:'核对方法的适用范围与回归样例',sources:'把关键声明，对应到原始记录',change:'先看受影响的成果，再安排重验',handoff:'把成果、缺口和继续方式一起交接'};return `<section class="delivery-card intelligent-card" aria-label="下一步交付检查"><div class="delivery-card-top"><span class="delivery-eyebrow">${v.personal?'PERSONAL DELIVERY':'TASK DELIVERY'}</span><button class="view-explanation" aria-controls="UI-03" aria-expanded="false" data-action="ui-explain">${v.pinned?'已固定':'情境推荐'} · ${viewCatalog[v.component]} ${icon('chevron')}</button></div><h3>${esc(current==='system'&&v.component==='evidence'?(v.personal?'先审阅工程设计，再交给开发':'核对当前约定与依据'):headlines[v.component])}</h3><p>${current==='system'?(v.changed?'旧验证仍保留，但不能支持新要求。独立的文件格式检查保持有效。':'缺件规则等待人工审阅；报告中的结论还缺定位检查与领域依据。'):esc(b[2])}</p><div class="delivery-card-actions"><button class="detail-action" data-inspect="delivery">${v.changed?'查看需要重验的部分':'查看约定与依据'} ${icon('arrow')}</button>${current==='system'&&!v.changed?'<button class="quiet-action" data-action="delivery-preview">试一次需求变更 '+icon('link')+'</button>':''}</div></section>`;}

function deliveryPanel(){
 const changed=state[current].deliveryChanged;
 if(current!=='system'){
 const goals={passport:['支持范围与误判门槛','缺少经授权样本与可信标签；单张图片不能证明证件绝对真实。'],ipo:['适用范围与依据版本','具体准则、期间和资料范围待领域人员确认。'],skill:['输入输出与组内依赖','需验证单技能正反例与整组样例；8个技能不是完成证据。'],document:['实测结论可定位到原始记录','未提供原始结果的数字不可称为实测；还需读者与渲染审阅。'],presentation:['受众、结论依据与可编辑性','PPT生成与渲染能力未接入；当前不具备交付条件。']};
 const g=goals[current]||['明确输出与验收方式','新工作还没有封版的约定和验证依据。'];
 return `<div class="inspector-eyebrow">DELIVERY / 交付约定</div><article class="paper"><div class="paper-label">先约定结果，再组织执行</div><h2>${esc(g[0])}</h2><span class="badge">待确认 · 示例</span><h3>当前缺口</h3><p>${esc(g[1])}</p><h3>下一步</h3><p>在对话中明确标准和材料。完成检查后，针对同一版本审阅；不能用生成文件数代替验收。</p><p class="paper-note">此处是工作包的设计示例，没有真实模型运行或审批。</p></article>`;
 }
 return `<div class="inspector-eyebrow">DELIVERY / 销售穿行系统</div><article class="paper delivery-paper"><div class="paper-label">交付约定 · ${changed?'v2 草稿':'v1 示例'}</div><h2>${changed?'变更后，重新建立依据':'每一个“完成”，都有依据'}</h2><p class="sample-label">合成示例 · 未运行真实系统 · 不代表审计准则</p><div class="criterion"><span class="criterion-id">AC-01</span><div><strong>支持约定的文件格式</strong><p>格式样例检查 v1 · 示例依据满足</p></div><span class="criterion-state">${changed?'保持有效':'示例满足'}</span></div><div class="criterion"><span class="criterion-id">AC-02</span><div><strong>${changed?'缺发票时转人工复核':'缺发票时显示缺件待补'}</strong><p>${changed?'旧验证 E-02 只针对规则 v1，不能支持新要求。':'示例验证 E-02 通过，仅适用于规则 v1；仍缺人工审阅。'}</p></div><span class="criterion-state warning">${changed?'需重验':'待审阅'}</span></div><div class="criterion"><span class="criterion-id">AC-03</span><div><strong>报告中的结论可定位到依据</strong><p>缺少报告定位检查与领域审阅记录。</p></div><span class="criterion-state warning">缺依据</span></div><h3>沿一条要求，看清依据</h3><ol class="evidence-path"><li><small>需求来源</small><strong>交付约定 ${changed?'v2 草稿':'v1'} · AC-02</strong></li><li><small>影响对象</small><button class="evidence-link" data-action="evidence-open">规则设计 v1 → 接口说明 v1 ${icon('arrow')}</button></li><li><small>验证记录</small><button class="evidence-link" data-action="evidence-open">E-02 · ${changed?'已失效，待重新验证':'示例通过 · 仅适用于 v1'} ${icon('arrow')}</button></li></ol><div class="delivery-verdict" role="status">${changed?'交付阻断：新要求仍缺当前版本的验证与审阅。':'当前不可交付：2 条约定仍需检查或补充依据。'}</div>${changed?'<h3>下一步：只处理受影响的部分</h3><p>修订规则设计和接口说明，重新执行对应样例，并审阅新版本。独立的格式检查不因本次修改自动失效。</p><button class="detail-action" data-action="delivery-reset">重置合成示例</button>':'<button class="detail-action" data-action="delivery-preview">预演：把缺件规则改为人工复核 '+icon('arrow')+'</button>'}<button class="quiet-action handoff-action" data-action="handoff-open">查看交接清单 ${icon('file')}</button></article>`;
}
function impactPanel(){return `<div class="inspector-eyebrow">CHANGE PREVIEW / 仅演示</div><article class="paper impact-paper"><div class="paper-label">一次修改，一条可检查的影响链</div><h2>先看影响，<br>再决定修改。</h2><div class="change-compare"><div><small>原约定 · v1</small><p>缺发票时<br><strong>显示缺件待补</strong></p></div><span aria-hidden="true">${icon('arrow')}</span><div><small>拟议约定 · v2</small><p>缺发票时<br><strong>转人工复核</strong></p></div></div><p class="sample-label">AC-02 · 合成需求变更，不代表审计准则</p><div class="impact-heading"><h3>需要重新核对</h3><span>3 项</span></div><div class="impact-list"><div><span class="impact-number">01</span><section><strong>规则设计 v1</strong><p>修改缺件分支，生成新草稿。</p></section><span class="impact-state">修订</span></div><div><span class="impact-number">02</span><section><strong>接口说明 v1</strong><p>补充人工复核状态与响应约定。</p></section><span class="impact-state">修订</span></div><div><span class="impact-number">03</span><section><strong>验证记录 E-02</strong><p>旧版本依据失效，新增样例重验。</p></section><span class="impact-state">重验</span></div></div><div class="preserved"><span>${icon('check')}</span><div><strong>文件格式检查保持有效</strong><p>AC-01 与本次规则修改无关。</p></div></div><details class="coverage-note"><summary>影响范围的依据与局限</summary><p>当前清单是已知关系的合成示例。实际范围取决于已建立的依赖；未核对的关系必须显示覆盖未知。</p></details><div class="delivery-verdict">应用后仍不可交付。新要求需要当前版本的验证与审阅。</div><button class="primary-button impact-apply" data-action="delivery-apply">应用到合成示例 ${icon('arrow')}</button><p class="note">仅改变本页演示状态，刷新恢复。</p><button class="quiet-action" data-action="back-delivery">${icon('chevron')} 返回交付约定</button></article>`;}
function evidencePanel(){const changed=state[current].deliveryChanged;return `<div class="inspector-eyebrow">EVIDENCE / E-02</div><article class="paper evidence-paper"><div class="paper-label">定位到具体版本，结论才有意义</div><h2>这份依据，<br>能支持哪条要求？</h2><span class="badge ${changed?'amber':'green'}">${changed?'旧版本依据 · 需重验':'仅适用于 v1 · 示例'}</span><dl class="evidence-facts"><dt>对应要求</dt><dd>AC-02 · 缺发票显示缺件待补</dd><dt>目标版本</dt><dd>规则设计 v1 / 接口说明 v1</dd><dt>样本定位</dt><dd>合成销售单据样本.csv<br>第 7 行 · SAMPLE-007</dd><dt>验证性质</dt><dd>界面合成记录，未执行真实检查</dd></dl><div class="source-excerpt"><div><span>样本摘录</span><span>第 7 行</span></div><code>订单 SO-007 · 发票字段为空</code><p>v1 示例预期：显示缺件待补。<br>v1 示例结果：与预期一致。</p></div><div class="delivery-verdict">${changed?'新要求是转人工复核。E-02 的目标仍是 v1，因此不能支持 v2。':'示例检查通过仍不能代替人工审阅或整个系统验收。'}</div><button class="quiet-action" data-action="back-delivery">${icon('chevron')} 返回交付约定</button></article>`;}
function handoffPanel(){return `<div class="inspector-eyebrow">HANDOFF / 交接清单预览</div><article class="paper"><div class="paper-label">成果、依据与未完成项，一起带走</div><h2>接手的人，<br>知道从哪里继续。</h2><p class="sample-label">清单结构示例 · 当前不能导出真实交付包</p><div class="handoff-list">${[['交付约定','当前约定版本、范围与不包括项'],['成果版本','设计、接口、代码与文件校验和'],['检查依据','受测版本、样本、结果与记录来源'],['开放问题','缺失依据、待复核项与已接受例外'],['继续工作','复现步骤、环境要求与下一负责人']].map(([t,d])=>`<div>${icon('file')}<section><strong>${t}</strong><p>${d}</p></section></div>`).join('')}</div><div class="delivery-verdict">缺口随成果一起交接；未通过项保留，不会因导出而变成已完成。</div><button class="quiet-action" data-action="back-delivery">${icon('chevron')} 返回交付约定</button></article>`;}

function renderTimeline(){const d=scenarios[current];$('#timeline').innerHTML=`<div class="date-divider">当前工作 · 交互演示</div><article class="message-row"><div class="avatar" aria-hidden="true">你</div><div class="message-body"><div class="message-meta"><strong>你</strong><span>工作目标</span></div><p class="message-text user-text">${esc(d.user)}</p></div></article><article class="message-row"><div class="avatar jojo" aria-hidden="true"></div><div class="message-body"><div class="message-meta"><strong>Jojo</strong><span>主协调 Agent</span></div><p class="message-text assistant-intro">${esc(d.reply)}</p>${stageCard()}${relay()}${current==='presentation'?'<div class="notice">需要接入 PPTX 生成与渲染能力。当前可查看扩展设计，不能启动生成。</div>':''}${artifacts()}${deliveryCard()}<div class="activity-note">${icon('link')}<span>${esc(d.activity)}</span></div></div></article>${state[current].messages.map(message=>`<article class="message-row"><div class="avatar" aria-hidden="true">你</div><div class="message-body"><div class="message-meta"><strong>你</strong><span>${esc(message.target?'给'+message.target+'的补充':'补充要求')}</span></div><p class="message-text user-text">${esc(message.text)}</p><p class="delivery-status">演示草稿已保留 · 未发送至模型</p></div></article>`).join('')}`;}
function targetChip(){const target=state[current].target;$('#target-chip').innerHTML=target?`<span class="target-pill">定向补充：${esc(target)}<button data-action="clear-target" aria-label="取消定向补充">${icon('close')}</button></span>`:'';}
function task(key){if(!scenarios[key])return;saveDraft();setScreen('UI-02');current=key;selectedAgent=key==='document'?'writer':'architect';nav();const m=meta[key],d=scenarios[key];$('#breadcrumb').innerHTML=`${esc(m.project)}<span>/</span><strong>${esc(d.title)}</strong>`;$('#worktitle').innerHTML=esc(d.title)+'<span class="title-dot">.</span>';$('#worksubtitle').textContent=m.tagline;$('#work-kicker').innerHTML=`${esc(m.english)} <span>／ ${esc(m.number)}</span>`;$('#material-count').textContent=m.files.length;$('#input').value=state[key].draft;$('#input').disabled=key==='presentation';renderTimeline();activity();targetChip();$('#timeline').scrollTop=state[key].scroll??$('#timeline').scrollHeight;document.title=d.title+' · jojo plan';}
const agentNames={coordinator:'主协调 Agent',architect:'架构师',tester:'测试 Agent',developer:'开发 Agent',writer:'写作 Agent'};
function consoleBlock(title,lines){return `<div class="console"><div class="console-top">${icon('terminal')}${esc(title)}<span style="margin-left:auto">示例</span></div><pre>${esc(lines)}</pre></div>`;}
function agentsPanel(){const paused=state[current].paused;
 if(current==='system')return `<div class="inspector-eyebrow">${paused?'演示已暂停':'2 个智能体执行中'} · 1 个等待依赖</div><div class="agent-tree">${['coordinator','architect','tester','developer'].map((a,i)=>`<button data-agent="${a}" class="${i?'branch':''}" aria-pressed="${selectedAgent===a}">${icon(a==='developer'?'code':'agent')}<span><strong>${agentNames[a]}</strong><small>${a==='coordinator'?'等待子任务成果':a==='developer'?'排队 · 等待工程基线':paused?'已暂停':a==='architect'?'运行中 · 证据链数据模型':'运行中 · 异常样例校验'}</small></span></button>`).join('')}</div>${agentDetail(selectedAgent)}`;
 if(current==='document')return `<div class="inspector-eyebrow">${paused?'演示已暂停':'1 个智能体执行中'}</div><div class="agent-tree"><button data-agent="writer" aria-pressed="true">${icon('agent')}<span><strong>写作 Agent</strong><small>${paused?'已暂停':'修订正文和步骤说明'}</small></span></button></div>${agentDetail('writer')}`;
 return `<div class="empty-state">${icon('agent')}<h3>当前没有智能体在执行</h3><p>${esc(scenarios[current].state)}。确认下一步后，执行详情将在这里出现。</p></div><p class="note">已完成的角色记录将进入历史，不计入当前工作数量。</p>`;
}
function agentDetail(a){const details={
 architect:['梳理单据、证据链、规则和报告之间的数据关系。','模型配置 A · v2','system-core@1.0.0','read_artifact  prd-v3       完成\nread_artifact  ux-v2        完成\nwrite_draft    data-model   完成\n\n等待模型返回下一段设计说明'],
 tester:['用合成单据验证异常样例格式；这里不是应用测试结果。','模型配置 B · v1','system-core@1.0.0','[sample-validator]\nloaded 12 synthetic examples\nchecking required fields…\n\nexit code: —'],
 developer:['工程基线尚未确认。模型和工具均未启动。','尚未启动','system-core@1.0.0','等待架构与测试设计通过\n尚无工具调用或后台进程'],
 coordinator:['汇总子任务成果、处理你的补充，并检查阶段出口。','模型配置 A · v2','system-core@1.0.0','等待子任务事件\n当前没有持续模型调用'],
 writer:['把部署失败案例拆成可理解的步骤，保留真实经历的来源。','模型配置 A · v2','document-core@1.0.0','read_artifact  experience-notes  完成\nwrite_draft    cicd-guide        进行中']
 }[a];return `<h3 class="detail-heading">${agentNames[a]}</h3><p class="detail-description">${details[0]}</p><dl class="detail-kv"><dt>输入依据</dt><dd>${current==='document'?'经验笔记 · 内容大纲':'PRD v3 · UI/UX v2'}</dd><dt>模型</dt><dd>${details[1]}</dd><dt>已加载技能</dt><dd>${details[2]}</dd><dt>当前状态</dt><dd>${state[current].paused?'演示已暂停':a==='developer'?'等待依赖':a==='coordinator'?'等待事件':'运行中 · 示例'}</dd></dl>${consoleBlock('执行记录',state[current].paused?'演示已暂停，未连接真实执行器。':details[3])}<button class="detail-action" data-target="${a}">${icon('plus')}给这个任务补充要求</button><p class="note">展示操作与结果摘要，不展示模型隐藏推理。</p>`;}
function jobsPanel(){const paused=state[current].paused,j=meta[current].jobs;return `<div class="count-grid"><div><b>${paused?0:j}</b><small>运行中</small></div><div><b>${paused?j:0}</b><small>${paused?'已暂停':'排队中'}</small></div><div><b>0</b><small>待核实</small></div></div>${j?`<div class="job-card"><span class="badge ${paused?'amber':'green'}">${paused?'已暂停':'运行中'} · 演示</span><h3>合成样例格式校验</h3><p class="detail-description">测试 Agent 正在核对必填字段与数据格式。</p><dl class="detail-kv"><dt>发起者</dt><dd>测试 Agent</dd><dt>执行器</dt><dd>sample-validator</dd><dt>Job 标识</dt><dd>demo-validation-01</dd><dt>退出码</dt><dd>尚未产生</dd></dl>${consoleBlock('stdout / stderr',paused?'演示已暂停；没有真实进程。':'loaded 12 synthetic examples\nchecking required fields…\nwaiting for validation result')}<button class="detail-action" data-agent="tester">查看所属智能体 ${icon('arrow')}</button></div>`:`<div class="empty-state">${icon('terminal')}<h3>后台很安静</h3><p>当前没有后台 Job。导入、导出、容器命令或发布运行时会显示在这里。</p></div>`}<p class="note">每次后台操作只计一个 Job，其子进程不会重复计数。模型对话本身不计为 Job。</p>`;}
function artifactPanel(mode){if(current==='presentation')return presentationPanel();const d=scenarios[current],secondary=mode==='secondary';return `<div class="inspector-eyebrow">${secondary?'VERIFY':'DESIGN'} / 示例草稿</div><article class="paper"><div class="paper-label">JOJO PLAN · WORKING DOCUMENT</div><h2>${esc(secondary?d.b:d.a)}</h2><span class="badge">未正式审阅</span><h3>01　目标与范围</h3><p>${esc(d.user)}</p><h3>02　${secondary?'验证思路':'核心关系'}</h3><p>${current==='system'?(secondary?'每条校验规则须覆盖正常、缺件、金额差异和证据不足的样例。修复后需在同一受测版本复验。':'原始单据通过可定位的证据片段连接到规则，再形成可追溯的结论。规则不直接改写原始材料。'):'明确输入依据和交付要求，保留来源、假设和未解决的问题。'}</p><div class="paper-diagram"><span>材料版本</span>→<span>${secondary?'验证样例':'证据片段'}</span>→<span>${secondary?'检查结果':'规则 / 结论'}</span></div><h3>03　待确认项</h3><ul><li>业务范围和适用条件</li><li>关键假设与例外处理</li><li>可复现的验证依据</li></ul><p class="paper-note">这是界面阅读示例，不是实际项目的审定成果。正式审批须绑定版本与输入基线。</p></article><button class="detail-action" style="margin-top:15px" data-action="artifact-comment">在对话中提出修改 ${icon('arrow')}</button>`;}
function presentationPanel(){const slides=[['从一次提交，到一次可靠发布','面向新人的 CI/CD 实践'],['把手工步骤，变成可重复的流程','构建 · 测试 · 部署'],['失败并不可怕，无法复现才是','记录依据，缩小范围，验证修复']];return `<div class="notice">PPT 工作包尚在规划中。下方是预览交互示意，未生成真实 PPTX。</div><div class="deck-preview"><div class="overline">CI/CD FIELD NOTES · ${String(slideIndex+1).padStart(2,'0')}</div><h3>${slides[slideIndex][0]}</h3><p>${slides[slideIndex][1]}</p></div><div class="slide-nav"><button data-slide="-1" aria-label="上一张幻灯片" ${slideIndex===0?'disabled':''}>←</button><span>${slideIndex+1} / 3 · 示意页面</span><button data-slide="1" aria-label="下一张幻灯片" ${slideIndex===2?'disabled':''}>→</button></div><dl class="detail-kv"><dt>可编辑文件</dt><dd>PPTX · 待生成器接入</dd><dt>视觉验证</dt><dd>页面渲染 · 待渲染器接入</dd><dt>补充产物</dt><dd>逐页内容、来源索引、演讲备注</dd></dl>`;}
function materialsPanel(){const files=meta[current].files;return `<div class="inspector-eyebrow">${files.length} 个示例文件 · 当前工作</div>${files.length?files.map((f,i)=>`<div class="file-row">${icon('file')}<div><strong>${esc(f)}</strong><small>${i===2?'合成样本':'参考材料'} · 示例条目</small></div><span class="badge">本地</span></div>`).join(''):`<div class="empty-state">${icon('folder')}<h3>还没有工作材料</h3><p>先明确工作目标，再补充资料。</p></div>`}<p class="note">当前是设计演示，不读取你的真实文件，也不会向模型发送材料。</p><button class="detail-action" data-action="materials-note">在对话中补充材料说明 ${icon('arrow')}</button>`;}
function planPanel(){const m=meta[current];return `<div class="inspector-eyebrow">${esc(scenarios[current].type)} / 完整流程</div>${m.stages.map((s,i)=>`<div class="plan-row"><span class="num">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(s)}</strong><p>${i<m.phase?'示例状态：本阶段已完成':i===m.phase?'当前阶段：'+esc(scenarios[current].state):'完成前置工作后开始'}</p></div>${i<m.phase?'<span class="badge green" style="margin-left:auto;align-self:flex-start">已完成</span>':''}</div>`).join('')}<p class="note">阶段的审阅门槛保留在同一条工作主线。文字中的“继续”不会替代绑定版本的审批。</p>`;}
function modelPanel(){return `<div class="inspector-eyebrow">协调者 / 模型与技能</div><h3 class="detail-heading">主协调 Agent</h3><p class="detail-description">组织当前工作、整理补充要求，并把任务交给对应的替身。</p><dl class="detail-kv"><dt>当前工作包</dt><dd>${esc(scenarios[current].type)}</dd><dt>版本</dt><dd>1.0.0 · 设计示例</dd><dt>模型连接</dt><dd>尚未连接真实服务</dd><dt>权限</dt><dd>由当前项目的授权范围决定</dd></dl><button class="detail-action" data-screen="UI-05">查看模型设置 ${icon('arrow')}</button>`;}
function inspect(mode,trigger){if(trigger)lastTrigger=trigger;panel=mode;const titles={personal:['spark','个人工作准则'],intelligence:['grid','界面推荐依据'],evidence:['link','依据定位'],handoff:['file','交接清单'],delivery:['file','交付约定'],impact:['file','变更预演'],execution:['agent','智能体'],jobs:['terminal','后台 Jobs'],artifact:['file','成果阅读'],secondary:['file','成果阅读'],materials:['folder','工作材料'],plan:['grid','工作计划'],model:['spark','模型与技能']};const title=titles[mode]||titles.artifact;const body=mode==='personal'?personalPanel():mode==='intelligence'?intelligentPanel():mode==='evidence'?evidencePanel():mode==='handoff'?handoffPanel():mode==='delivery'?deliveryPanel():mode==='impact'?impactPanel():mode==='execution'?agentsPanel():mode==='jobs'?jobsPanel():mode==='materials'?materialsPanel():mode==='plan'?planPanel():mode==='model'?modelPanel():artifactPanel(mode);const el=$('#UI-03');el.innerHTML=`<div class="inspector-head"><h2 id="inspector-title">${icon(title[0])}${title[1]}</h2><div class="inspector-actions">${['artifact','secondary','delivery','impact','evidence','handoff','personal','intelligence'].includes(mode)?`<button class="icon-button" data-action="expand-panel" aria-label="切换宽幅阅读">${icon('expand')}</button>`:''}<button class="icon-button" id="close" data-action="close-panel" aria-label="关闭详情">${icon('close')}</button></div></div><div class="inspector-content">${body}</div>`;el.hidden=false;panelModality();activity();$$('[data-inspect],.personal-chip,[data-action="ui-explain"]').forEach(b=>b.setAttribute('aria-expanded',b.dataset.inspect===mode||(mode==='personal'&&b.matches('.personal-chip'))||(mode==='intelligence'&&b.dataset.action==='ui-explain')));$('#close').focus();}
function setBackgroundInert(value){for(const selector of ['.conversation','.sidebar','.topbar','.work-heading','#delivery-summary','.app-foot','#UI-01','#UI-04','#UI-05']){const el=$(selector);if(el)el.inert=value;}}
function panelModality(){const el=$('#UI-03');if(el.hidden)return;const overlay=innerWidth<=1250||screen!=='UI-02';setBackgroundInert(overlay);if(overlay){el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','inspector-title');}else{el.removeAttribute('role');el.removeAttribute('aria-modal');el.removeAttribute('aria-labelledby');}}
function send(){const text=$('#input').value.trim();if(!text||current==='presentation')return;state[current].messages.push({text,target:state[current].target});state[current].draft='';state[current].target=null;$('#input').value='';renderTimeline();activity();targetChip();$('#timeline').scrollTop=$('#timeline').scrollHeight;toast('补充已保留在本次演示中，未发送至真实模型。');}
function newScreen(){setScreen('UI-01');$('#UI-01').innerHTML=`<div class="screen-inner"><div class="start-hero"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><div class="overline">FROM INTENT TO EVIDENCE</div><h1>把想法，<br>交付成结果。</h1><p class="screen-lead">按你认可的方法，整理交付约定、组织执行、核查依据。<br>当前最需要检查的部分，会随任务带到面前。</p></div><div class="type-options">${[['skill','spark','制作 Skill','研究方法，沉淀为能力'],['document','file','写文档','组织内容，核查依据'],['system','code','开发系统','从产品方案到工程交付']].map(([k,i,t,desc])=>`<button class="type-option" data-new-type="${k}" aria-pressed="${newType===k}">${icon(i)}<strong>${t}</strong><small>${desc}</small></button>`).join('')}</div><form class="new-form" id="new-form"><label class="field-label" for="new-goal">工作目标</label><textarea id="new-goal" placeholder="例如：把销售单据整理成可追溯的勾稽链条，并开发相应的校验系统。" maxlength="20000" required></textarea><div id="goal-error" class="field-error" role="alert"></div><div class="form-bottom"><label class="sr-only" for="new-project">所属项目</label><select id="new-project"><option>审计项目</option><option>护照校验项目</option><option>知识与分享</option></select><button class="primary-button" type="submit">整理交付约定 ${icon('arrow')}</button></div></form><p class="note">本次仅创建演示草稿。真实工作启动前需确认模型、预算、权限及材料范围。</p></div>`;$('#new-form').addEventListener('submit',e=>{e.preventDefault();createDraft();});}
function createDraft(){const goal=$('#new-goal').value.trim();if(!goal){$('#goal-error').textContent='请先描述想完成的工作。';$('#new-goal').focus();return;}const key='draft-'+Date.now(),project=$('#new-project').value;scenarios[key]={...scenarios[newType],title:goal.length>18?goal.slice(0,18)+'…':goal,user:goal,reply:'已整理为一个演示工作草稿。下一步需要补齐交付要求，再确认模型、预算与材料权限。此处不会调用模型或启动执行。',state:'草稿 · 尚未启动',plan:'确认工作目标',a:'交付要求 · 待整理',b:'启动清单 · 待确认',activity:'当前没有真实智能体或后台 Job。'};meta[key]={...meta[newType],project,tagline:'把目标整理清楚，再开始下一步。',short:'演示草稿 · 未启动',count:0,jobs:0,phase:0,files:[],number:'NEW'};state[key]={draft:'',messages:[],paused:false,target:null,scroll:null};groups.find(g=>g.name===project).keys.push(key);task(key);toast('已创建演示草稿。关闭或刷新页面后清除，不会启动真实工作。');}
function library(){setScreen('UI-04');$('#UI-04').innerHTML=`<div class="screen-inner"><div class="overline">CAPABILITIES, COMPOSED.</div><h1>同一个替身，<br>不止一种工作方式。</h1><p class="screen-lead">工作包决定怎样做；交付约定决定怎样才算做好。研究、文档、系统和未来的PPT，共用版本、依据与审阅。</p><div class="package-grid">${[['skill','spark','制作 Skill','把研究变成可复用的方法。定义输入输出，组织技能依赖，验证后再启用。'],['document','file','写文档','从大纲到正文，用来源支撑观点。经验分享和测试报告保留各自的证据要求。'],['system','code','开发系统','产品、设计、架构、研发与测试协作推进。阶段审阅、缺陷修复、最终验收都留在主线上。'],['presentation','slides','写 PPT','从故事线到逐页内容、排版和渲染检查。后续接入生成器与预览器，沿用同一个工作区。']].map(([k,i,t,desc],n)=>`<article class="package-card"><span class="package-id">0${n+1} / WORK PACKAGE</span><span class="package-icon">${icon(i)}</span><h2>${t}${k==='presentation'?'<span class="badge amber">规划中</span>':''}</h2><p>${desc}</p><button data-task="${k}">${k==='presentation'?'查看扩展设计':'查看工作示例'} ${icon('arrow')}</button></article>`).join('')}</div><p class="note">首版三类工作包。新增格式需要经过验证的工具支持，不能只换一段提示词。</p></div>`;}
function settings(){setScreen('UI-05');$('#UI-05').innerHTML=`<div class="screen-inner"><div class="overline">YOUR PERSONAL DELIVERY PARTNER.</div><h1>你的工作方法，<br>你的交付替身。</h1><p class="screen-lead">模型、工具和权限分开管理。缺少能力时明确说明，工作记录始终留在你的项目里。</p><div class="settings-list">${[['个人工作准则','查看来源、使用范围与本次开关。','查看准则'],['模型连接','自带模型服务；各角色可选择不同模型。','未连接'],['工具与环境','搜索、OCR、容器和发布目标分别检查。','查看说明'],['权限与预算','材料发送范围、工具权限与运行上限。','查看说明'],['数据与备份','本地保存、备份恢复和项目归档。','查看说明']].map(([t,d,b])=>`<div class="setting-row"><div><h2>${t}</h2><p>${d}</p></div><button data-setting="${t}">${b}</button></div>`).join('')}<div class="setting-row"><div><h2>演示说明</h2><p>页面中的新增草稿、补充和暂停只作用于本次演示；刷新即清除。</p></div><button data-setting="演示说明">了解演示范围</button></div></div><div class="notice" id="setting-info" hidden></div></div>`;}
function search(){saveDraft();$('#palette-input').value='';paletteIndex=0;renderSearch();$('#palette').showModal();$('#palette-input').focus();}
function renderSearch(){const q=$('#palette-input').value.trim().toLowerCase();const items=Object.keys(scenarios).filter(k=>(scenarios[k].title+meta[k].project).toLowerCase().includes(q)).map(k=>({task:k,label:scenarios[k].title,sub:meta[k].project,icon:'file'}));for(const [id,label] of [['UI-01','新工作'],['UI-04','能力库'],['UI-05','设置']])if(label.includes(q))items.push({screen:id,label,sub:'工作区',icon:'grid'});paletteIndex=Math.max(0,Math.min(paletteIndex,items.length-1));$('#palette-results').innerHTML=items.length?items.map((x,i)=>`<button class="palette-item ${i===paletteIndex?'chosen':''}" ${x.task?`data-task="${x.task}"`:`data-screen="${x.screen}"`}>${icon(x.icon)}<strong>${esc(x.label)}</strong><small>${esc(x.sub)}</small></button>`).join(''):'<div class="empty-state"><h3>没有找到匹配的工作</h3><p>试试项目名称，或直接新建工作。</p></div>';}
function navigate(id){if(id==='UI-01')newScreen();else if(id==='UI-04')library();else if(id==='UI-05')settings();}
document.addEventListener('click',e=>{
 const b=e.target.closest('button,[data-action]');if(!b)return;
 if(b.closest('#palette')&&(b.dataset.task||b.dataset.screen))$('#palette').close();
 if(b.dataset.task)task(b.dataset.task);
 if(b.dataset.screen)navigate(b.dataset.screen);
 if(b.dataset.group){const el=$('#group-'+b.dataset.group);el.hidden=!el.hidden;b.setAttribute('aria-expanded',!el.hidden);}
 if(b.dataset.inspect){if(panel===b.dataset.inspect)closePanel();else inspect(b.dataset.inspect,b);}
 if(b.dataset.agent){selectedAgent=b.dataset.agent;inspect('execution',b.closest('#UI-03')?lastTrigger:b);}
 if(b.dataset.target){state[current].target=agentNames[b.dataset.target];closePanel(false);targetChip();$('#input').focus();}
 if(b.dataset.newType){newType=b.dataset.newType;$$('[data-new-type]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.newType===newType));}
 if(b.dataset.slide){slideIndex+=Number(b.dataset.slide);inspect(panel||'artifact');}
 if(b.dataset.setting==='个人工作准则'){task(current);inspect('personal',$('.personal-chip'));}
 if(b.dataset.setting&&b.dataset.setting!=='个人工作准则'){const text={'模型连接':'设计演示不收集密钥，也不测试真实连接。正式产品支持服务地址、协议、模型标识与能力检查。','工具与环境':'各项能力单独验证。容器不可用时，写技能和文档仍可工作；PPT 生成和渲染属于后续扩展。','权限与预算':'真实启动前确认材料发送范围和 token 上限。对话补充不能代替生产发布授权。','数据与备份':'正式产品支持本地备份、恢复和归档。此设计稿不会读写你的项目文件。','演示说明':'所有执行状态和成果均为示例。交互只存于当前页面内存；不会调用模型、运行进程或保存密钥。'}[b.dataset.setting];$('#setting-info').hidden=false;$('#setting-info').textContent=text;$('#setting-info').scrollIntoView({block:'nearest'});}
 const action=b.dataset.action;
 if(action==='personal-open'){if(!panel)lastTrigger=b;inspect('personal');}
 if(action==='ui-explain'){if(!panel)lastTrigger=b;inspect('intelligence');}
 if(action==='personal-toggle'){state[current].personalOff=!state[current].personalOff;const pos=$('#timeline').scrollTop;renderTimeline();$('#timeline').scrollTop=pos;inspect('personal');}
 if(action==='view-pin'){state[current].pinnedComponent=state[current].pinnedComponent?null:contextSelection().component;const pos=$('#timeline').scrollTop;renderTimeline();$('#timeline').scrollTop=pos;inspect('intelligence');}
 if(action==='candidate-accept'||action==='candidate-ignore'||action==='candidate-reset'){personalDemo.candidate=action==='candidate-accept'?'accepted':action==='candidate-ignore'?'ignored':'proposed';inspect('personal');}
 if(action==='delivery-preview'){if(!panel)lastTrigger=b;inspect('impact');}
 if(action==='evidence-open')inspect('evidence');
 if(action==='handoff-open')inspect('handoff');
 if(action==='back-delivery')inspect('delivery');
 if(action==='delivery-apply'||action==='delivery-reset'){state[current].deliveryChanged=action==='delivery-apply';const scroll=$('#timeline').scrollTop;renderTimeline();$('#timeline').scrollTop=scroll;inspect('delivery');}
 if(action==='new'){e.preventDefault();newScreen();}
 if(action==='search')search();
 if(action==='close-palette')$('#palette').close();
 if(action==='close-panel')closePanel();
 if(action==='expand-panel'){$('#UI-03').classList.toggle('wide');b.setAttribute('aria-pressed',$('#UI-03').classList.contains('wide'));}
 if(action==='clear-target'){state[current].target=null;targetChip();$('#input').focus();}
 if(action==='artifact-comment'||action==='materials-note'){const value=action==='artifact-comment'?'关于这份成果，我希望调整：':'补充材料说明：';closePanel(false);$('#input').value=state[current].draft+value;state[current].draft=$('#input').value;activity();$('#input').focus();}
 if(b.id==='pause'){state[current].paused=!state[current].paused;const scroll=$('#timeline').scrollTop;renderTimeline();$('#timeline').scrollTop=scroll;activity();if(panel)inspect(panel);toast(state[current].paused?'演示已暂停：计数与详情已同步。没有真实进程被停止。':'演示已恢复：这不会启动真实模型或进程。');}
 if(b.id==='send')send();
});
$('#input').addEventListener('input',()=>{state[current].draft=$('#input').value;$('#send').disabled=!$('#input').value.trim()||current==='presentation';});
$('#palette-input').addEventListener('input',()=>{paletteIndex=0;renderSearch();});
$('#palette').addEventListener('click',e=>{if(e.target===$('#palette')){const r=$('#palette').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#palette').close();}});
document.addEventListener('keydown',e=>{
 if(e.isComposing)return;
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('#palette').open)search();return;}
 if($('#palette').open){if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const n=$$('.palette-item').length;paletteIndex=Math.max(0,Math.min(n-1,paletteIndex+(e.key==='ArrowDown'?1:-1)));renderSearch();$('.palette-item.chosen')?.scrollIntoView({block:'nearest'});}if(e.key==='Enter'&&document.activeElement===$('#palette-input')){e.preventDefault();$('.palette-item.chosen')?.click();}return;}
 if(e.key==='Escape'&&panel){e.preventDefault();closePanel();return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newScreen();$('#new-goal').focus();return;}
 if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&screen==='UI-02'&&!$('.conversation').inert){e.preventDefault();send();}
 if(e.key==='Tab'&&panel&&(innerWidth<=1250||screen!=='UI-02')){const els=$$('#UI-03 button:not(:disabled),#UI-03 summary,#UI-03 [tabindex="0"]');const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
window.addEventListener('resize',panelModality);
nav();task('system');
