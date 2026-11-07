import { Fragment } from 'react';
import PageSkeleton, { SkeletonBlock } from '../../components/common/PageSkeleton.jsx';

const subjects = [0, 1, 2, 3, 4];

export default function MasterSheetSkeleton() {
  return <PageSkeleton label="Loading Master Sheet data">
    <div className="ms-table-wrapper ms-loading-table">
      <table className="ms-loading-grid" aria-hidden="true">
        <thead>
          <tr>
            <th className="ms-loading-name" rowSpan={3}><SkeletonBlock width="72%" /></th>
            {subjects.map(subject => <th className="ms-loading-subject" colSpan={4} key={subject}><SkeletonBlock width="52%" /></th>)}
          </tr>
          <tr>
            {subjects.map(subject => <Fragment key={subject}>
              <th colSpan={3}><SkeletonBlock width="35%" /></th>
              <th className="ms-loading-final" rowSpan={2}><SkeletonBlock width="65%" height={20} /></th>
            </Fragment>)}
          </tr>
          <tr>
            {subjects.flatMap(subject => [0, 1, 2].map(term => <th className="ms-loading-grade" key={`${subject}-${term}`}><SkeletonBlock width={12} height={10} /></th>))}
          </tr>
        </thead>
        <tbody>
          {[0, 1].map(group => <Fragment key={group}>
            <tr className="ms-loading-group"><td colSpan={21}><SkeletonBlock width={66} height={10} /></td></tr>
            {Array.from({ length: group === 0 ? 4 : 3 }, (_, row) => <tr className="ms-loading-row" key={row}>
              <td className="ms-loading-learner"><SkeletonBlock width="72%" height={12} /><SkeletonBlock width="46%" height={8} /></td>
              {subjects.flatMap(subject => [0, 1, 2, 3].map(term => <td key={`${subject}-${term}`} className={term === 3 ? 'ms-loading-final' : 'ms-loading-grade'}><SkeletonBlock width={18} height={10} /></td>))}
            </tr>)}
          </Fragment>)}
        </tbody>
      </table>
    </div>
  </PageSkeleton>;
}
