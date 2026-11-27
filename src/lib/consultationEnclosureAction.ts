import type { ConsultationProject } from './consultationProject';
/** Quick-add changes only the enclosure/required cover choice. Existing
 * dimensions, saved wall options, deck and finishes remain editable. */
export function enclosureQuickAction(project:ConsultationProject,kind:'screen'|'sunroom'){
 const isSunroom=kind==='sunroom';
 const selected=isSunroom?'elite-add-a-room':
  project.coverScreenStyle?.startsWith('dolce-')?project.coverScreenStyle:'dolce-open-view';
 const patch:Partial<ConsultationProject>={};
 if(project.coverScreenStyle!==selected)
  patch.coverScreenStyle=selected as ConsultationProject['coverScreenStyle'];
 if(project.coverFamily==='none'||(isSunroom&&!['Moderno','Contempo','Classico'].includes(project.coverFamily)))
  patch.coverFamily='Moderno';
 // Match ordinary cover selection without touching site-concrete/patio data
 // or an unfamiliar legacy project kind. A covered deck must export its
 // incomplete cover takeoff warning consistently through either UI path.
 if(project.kind==='deck')patch.kind='covered-deck';
 const already=Object.keys(patch).length===0;
 return {patch,section:isSunroom?'sunroom' as const:'cover' as const,
  message:(isSunroom?'Sunroom':'Screen room')+(already?' options opened. ':' added. ')+
   (isSunroom?'Configure wall sections, windows and doors below.':'Configure wall style, sides and entry doors below.')};
}
