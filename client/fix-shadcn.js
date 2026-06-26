const fs = require('fs');

function replaceSettings(path) {
  let content = fs.readFileSync(path, 'utf8');

  // Remove imports
  content = content.replace(/import \{ Card.*?\} from .@\/components\/ui\/card.;\n/g, '');
  content = content.replace(/import \{ Button.*?\} from .@\/components\/ui\/button.;\n/g, '');
  content = content.replace(/import \{ Input.*?\} from .@\/components\/ui\/input.;\n/g, '');
  content = content.replace(/import \{ Label.*?\} from .@\/components\/ui\/label.;\n/g, '');
  content = content.replace(/import \{ Switch.*?\} from .@\/components\/ui\/switch.;\n/g, '');

  // Replace components
  content = content.replace(/<Card>/g, '<div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6">');
  content = content.replace(/<\/Card>/g, '</div>');

  content = content.replace(/<CardHeader>/g, '<div className="p-6 border-b border-zinc-800/60">');
  content = content.replace(/<\/CardHeader>/g, '</div>');

  content = content.replace(/<CardTitle>/g, '<h3 className="text-lg font-semibold text-white mb-1">');
  content = content.replace(/<\/CardTitle>/g, '</h3>');

  content = content.replace(/<CardDescription>/g, '<p className="text-sm text-zinc-400">');
  content = content.replace(/<\/CardDescription>/g, '</p>');

  content = content.replace(/<CardContent className="(.*?)">/g, '<div className="p-6 $1">');
  content = content.replace(/<CardContent>/g, '<div className="p-6">');
  content = content.replace(/<\/CardContent>/g, '</div>');

  content = content.replace(/<CardFooter className="(.*?)">/g, '<div className="p-6 bg-zinc-900/20 $1">');
  content = content.replace(/<\/CardFooter>/g, '</div>');

  content = content.replace(/<Label/g, '<label className="text-sm font-medium text-zinc-200"');
  content = content.replace(/<\/Label>/g, '</label>');

  content = content.replace(/<Input/g, '<input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"');

  content = content.replace(/<Button variant="outline" size="icon"/g, '<button className="h-10 w-10 flex items-center justify-center border border-zinc-800 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"');
  content = content.replace(/<Button variant="outline" size="sm"/g, '<button className="h-9 px-3 flex items-center justify-center border border-zinc-800 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-sm font-medium"');
  content = content.replace(/<Button variant="ghost" size="icon"/g, '<button className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"');
  content = content.replace(/<Button variant="destructive"/g, '<button className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium text-sm transition-colors"');
  
  // Base button replace (has to come after variant replaces)
  content = content.replace(/<Button/g, '<button className="h-10 px-4 flex items-center justify-center bg-white text-black hover:bg-zinc-200 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"');
  content = content.replace(/<\/Button>/g, '</button>');

  content = content.replace(/<Switch\s+checked=\{([^}]+)\}\s+onCheckedChange=\{([^}]+)\}\s*(disabled)?\s*\/>/g, (match, p1, p2, disabled) => {
    return `<button type="button" onClick={() => (${p2})(!${p1})} ${disabled ? 'disabled' : ''} className={\`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 \${ ${p1} ? 'bg-white' : 'bg-zinc-800' }\`}> <span className={\`pointer-events-none block h-4 w-4 rounded-full bg-black shadow-lg ring-0 transition-transform \${ ${p1} ? 'translate-x-4' : 'translate-x-0' }\`} /> </button>`;
  });

  fs.writeFileSync(path, content);
}

function replaceComponents(path) {
  let content = fs.readFileSync(path, 'utf8');

  // Remove imports
  content = content.replace(/import \{ Card.*?\} from .@\/components\/ui\/card.;\n/g, '');
  content = content.replace(/import \{ Button.*?\} from .@\/components\/ui\/button.;\n/g, '');
  content = content.replace(/import \{ Input.*?\} from .@\/components\/ui\/input.;\n/g, '');
  content = content.replace(/import \{ Label.*?\} from .@\/components\/ui\/label.;\n/g, '');
  content = content.replace(/import \{ Select.*?\} from .@\/components\/ui\/select.;\n/g, '');
  content = content.replace(/import \{ Dialog.*?\} from .@\/components\/ui\/dialog.;\n/g, '');

  // Replace simple components
  content = content.replace(/<Card className="(.*?)">/g, '<div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6 $1">');
  content = content.replace(/<Card>/g, '<div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6">');
  content = content.replace(/<\/Card>/g, '</div>');

  content = content.replace(/<CardHeader>/g, '<div className="p-6 border-b border-zinc-800/60">');
  content = content.replace(/<\/CardHeader>/g, '</div>');
  content = content.replace(/<CardTitle>/g, '<h3 className="text-lg font-semibold text-white mb-1">');
  content = content.replace(/<\/CardTitle>/g, '</h3>');
  content = content.replace(/<CardDescription>/g, '<p className="text-sm text-zinc-400">');
  content = content.replace(/<\/CardDescription>/g, '</p>');
  content = content.replace(/<CardContent>/g, '<div className="p-6">');
  content = content.replace(/<\/CardContent>/g, '</div>');

  content = content.replace(/<Label/g, '<label className="text-sm font-medium text-zinc-200"');
  content = content.replace(/<\/Label>/g, '</label>');
  content = content.replace(/<Input/g, '<input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"');

  content = content.replace(/<Button variant="outline" size="icon"/g, '<button type="button" className="h-10 w-10 flex items-center justify-center border border-zinc-800 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"');
  content = content.replace(/<Button variant="outline"/g, '<button type="button" className="h-10 px-4 flex items-center justify-center border border-zinc-800 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-sm font-medium"');
  content = content.replace(/<Button variant="ghost" size="icon"/g, '<button type="button" className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"');
  content = content.replace(/<Button type="submit"/g, '<button type="submit" className="h-10 px-4 w-full flex items-center justify-center bg-white text-black hover:bg-zinc-200 rounded-md font-medium text-sm transition-colors"');
  content = content.replace(/<Button/g, '<button type="button" className="h-10 px-4 flex items-center justify-center bg-white text-black hover:bg-zinc-200 rounded-md font-medium text-sm transition-colors"');
  content = content.replace(/<\/Button>/g, '</button>');

  // We are going to quickly replace Dialog with a simple native HTML dialog or state-driven modal
  // But since Dialog is stateful in Shadcn, it's easier to just use standard React state we already have: `isCreating`
  content = content.replace(/<Dialog open=\{isCreating\} onOpenChange=\{setIsCreating\}>/g, '{isCreating && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"><div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl p-6 w-full max-w-md relative">');
  content = content.replace(/<\/Dialog>/g, '</div></div>}');
  content = content.replace(/<DialogTrigger asChild>/g, '');
  content = content.replace(/<\/DialogTrigger>/g, '');
  content = content.replace(/<DialogContent>/g, '');
  content = content.replace(/<\/DialogContent>/g, '');
  content = content.replace(/<DialogHeader>/g, '<div className="mb-4">');
  content = content.replace(/<\/DialogHeader>/g, '</div>');
  content = content.replace(/<DialogTitle>/g, '<h2 className="text-lg font-semibold text-white">');
  content = content.replace(/<\/DialogTitle>/g, '</h2>');

  // Replace Select with native <select>
  content = content.replace(/<Select value=\{([^}]+)\} onValueChange=\{\(val\) => ([^}]+)\}>/g, '<select value={$1} onChange={(e) => $2(e.target.value)} className="h-9 px-3 w-[180px] bg-[#0a0a0a] border border-zinc-800 rounded-md text-sm text-zinc-300 focus:outline-none">');
  content = content.replace(/<\/Select>/g, '</select>');
  content = content.replace(/<SelectTrigger.*?>/g, '');
  content = content.replace(/<\/SelectTrigger>/g, '');
  content = content.replace(/<SelectValue \/>/g, '');
  content = content.replace(/<SelectContent>/g, '');
  content = content.replace(/<\/SelectContent>/g, '');
  content = content.replace(/<SelectItem value="([^"]+)">([^<]+)<\/SelectItem>/g, '<option value="$1">$2</option>');

  fs.writeFileSync(path, content);
}

replaceSettings('C:/mini Desktop/AI_Agents/client/app/dashboard/logs/[projectId]/status-page/settings/page.tsx');
replaceComponents('C:/mini Desktop/AI_Agents/client/app/dashboard/logs/[projectId]/status-page/components/page.tsx');
console.log('Done!');
