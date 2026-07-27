import labelSvg from '@material-symbols/svg-400/outlined/label.svg?raw';
import { createFileRoute } from '@tanstack/react-router';
import { EmptyView } from '../../components/EmptyView.js';

export const Route = createFileRoute('/_shell/label/$labelName')({
  component: LabelView,
});

function LabelView() {
  const { labelName } = Route.useParams();
  // Label-filtered grid lands in M4.
  return <EmptyView svg={labelSvg} text={labelName} />;
}
